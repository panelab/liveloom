<script setup lang="ts">
const dash = useDashboard()
const { data: chat } = await useChatConfig()

const chatSources = computed(() => [chat.value?.twitch, chat.value?.kick, chat.value?.youtube].filter(Boolean).length)

const steps = computed(() => [
  { done: dash.destinations.value.length > 0, title: 'Add a destination', description: 'YouTube, Twitch, Kick, or any RTMP server.', to: '/destinations', cta: 'Add' },
  { done: dash.isLive.value || dash.destinations.value.some((d) => d.status.startedAt), title: 'Point OBS at LiveLoom', description: 'Paste the server and stream key into OBS.', to: '/setup', cta: 'Open setup' },
  { done: chatSources.value > 0, title: 'Connect your chats', description: 'Merge Twitch, Kick and YouTube chat in one feed.', to: '/chat', cta: 'Connect' },
])
const setupDone = computed(() => steps.value.every((s) => s.done))

const stats = computed(() => [
  { label: 'Status', value: dash.isLive.value ? 'Live' : 'Offline', mono: false, accent: dash.isLive.value ? 'text-success' : 'text-highlighted' },
  { label: 'Uptime', value: dash.uptime.value ?? '—', mono: true },
  { label: 'Destinations live', value: `${dash.streaming.value.length} / ${dash.enabled.value.length}`, mono: true },
  { label: 'Outgoing', value: formatKbps(dash.totalKbps.value), mono: true },
])
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar title="Overview" :ui="{ root: 'h-12' }">
        <template #right>
          <UButton label="Add destination" icon="i-lucide-plus" to="/destinations?add=1" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <!-- Status header -->
        <div class="flex flex-wrap items-center gap-3">
          <StatusDot :color="dash.isLive.value ? 'bg-success' : 'bg-(--ui-text-dimmed)'" :pulse="dash.isLive.value" />
          <h1 class="text-lg font-semibold text-highlighted">
            {{ dash.isLive.value ? 'You are live' : 'You are offline' }}
          </h1>
          <span class="text-sm text-muted">
            {{ dash.isLive.value
              ? `Sending to ${dash.streaming.value.length} of ${dash.enabled.value.length} destinations`
              : 'Start streaming in OBS and every enabled destination goes live.' }}
          </span>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-2 lg:grid-cols-4 rounded-lg border border-default divide-x divide-y lg:divide-y-0 divide-default overflow-hidden">
          <div v-for="s in stats" :key="s.label" class="bg-elevated/40 px-4 py-3">
            <p class="section-label">{{ s.label }}</p>
            <p class="mt-1 text-xl font-semibold tabular-nums" :class="[s.mono && 'font-mono', s.accent ?? 'text-highlighted']">{{ s.value }}</p>
          </div>
        </div>

        <!-- Getting started -->
        <Section v-if="!setupDone" title="Get started" description="Three steps to go live everywhere at once.">
          <ol class="divide-y divide-default -my-2">
            <li v-for="(s, i) in steps" :key="s.title" class="flex items-center gap-3 py-2.5">
              <span
                class="grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-medium"
                :class="s.done ? 'border-success/40 bg-success/15 text-success' : 'border-default text-muted'"
              >
                <UIcon v-if="s.done" name="i-lucide-check" class="size-3" />
                <template v-else>{{ i + 1 }}</template>
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm" :class="s.done ? 'text-muted line-through' : 'text-highlighted'">{{ s.title }}</p>
                <p class="text-xs text-dimmed">{{ s.description }}</p>
              </div>
              <UButton v-if="!s.done" :label="s.cta" :to="s.to" variant="outline" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right" />
            </li>
          </ol>
        </Section>

        <!-- Destinations summary -->
        <Section title="Destinations" description="Where your stream is sent.">
          <template #actions>
            <UButton label="Manage" to="/destinations" variant="ghost" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right" />
          </template>
          <div v-if="dash.pending.value" class="space-y-2">
            <USkeleton v-for="i in 3" :key="i" class="h-9" />
          </div>
          <UEmpty
            v-else-if="!dash.destinations.value.length"
            icon="i-lucide-radio-tower"
            title="No destinations yet"
            description="Add YouTube, Twitch or Kick. You stream once and LiveLoom sends it to all of them."
            :actions="[{ label: 'Add destination', icon: 'i-lucide-plus', to: '/destinations?add=1' }]"
            variant="naked"
            size="sm"
          />
          <ul v-else class="-my-1 divide-y divide-default">
            <li v-for="d in dash.destinations.value" :key="d.id" class="flex items-center gap-3 py-2">
              <UIcon :name="platformIcon[d.platform] ?? platformIcon.custom" class="size-4 shrink-0" :style="{ color: platformColor[d.platform] }" />
              <span class="flex-1 truncate text-sm" :class="d.enabled ? 'text-highlighted' : 'text-dimmed'">{{ d.name }}</span>
              <span class="hidden sm:block font-mono text-xs text-muted tabular-nums w-20 text-right">
                {{ d.enabled && d.status.state === 'live' ? formatKbps(d.status.bitrateKbps) : '' }}
              </span>
              <span class="flex w-28 items-center justify-end gap-1.5 text-xs" :class="destinationState(d.enabled, d.status.state, dash.isLive.value).text">
                <StatusDot :color="destinationState(d.enabled, d.status.state, dash.isLive.value).dot" :pulse="destinationState(d.enabled, d.status.state, dash.isLive.value).pulse" />
                {{ destinationState(d.enabled, d.status.state, dash.isLive.value).label }}
              </span>
            </li>
          </ul>
        </Section>
      </div>
    </template>
  </UDashboardPanel>
</template>
