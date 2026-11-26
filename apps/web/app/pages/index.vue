<script setup lang="ts">
import type { Step } from '~/components/ui/Steps.vue'

const dash = useDashboard()
const { data: connections } = await useConnections()
const { data: chat } = await useChatConfig()

const anyConnected = computed(() => connections.value.some((c) => c.connected) || dash.destinations.value.length > 0)
const pluginSignedIn = computed(() => !!chat.value?.pluginSeen)
const steps = computed<Step[]>(() => [
  {
    title: 'Connect your platforms',
    description: 'Sign in to YouTube, Twitch or Kick. Stream keys and chat are set up for you.',
    done: anyConnected.value,
    to: '/destinations',
    cta: 'Connect',
  },
  {
    title: 'Sign in from OBS',
    description: 'Install the Multichat plugin and approve it. It fills in OBS’s stream settings.',
    done: pluginSignedIn.value || dash.isLive.value || dash.destinations.value.some((d) => d.status.startedAt),
    to: '/setup',
    cta: 'Set up OBS',
  },
  {
    title: 'Go live',
    description: 'Press Start Streaming in OBS. Every enabled destination goes live together.',
    done: dash.isLive.value,
  },
])
const setupDone = computed(() => steps.value.every((s) => s.done))
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar title="Overview" :ui="{ root: 'h-14' }">
        <template #right>
          <UButton label="Add destination" icon="i-lucide-plus" to="/destinations" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <UiPageIntro
          :title="dash.isLive.value ? 'You’re live' : 'You’re offline'"
          :description="dash.isLive.value
            ? `Sending to ${dash.streaming.value.length} of ${dash.enabled.value.length} destinations.`
            : 'Start streaming in OBS and every enabled destination goes live together.'"
        >
          <template #leading>
            <UiStatus :tone="dash.isLive.value ? 'live' : 'off'" />
          </template>
        </UiPageIntro>

        <div class="grid grid-cols-2 divide-x divide-y divide-default overflow-hidden rounded-lg border border-default bg-elevated/30 lg:grid-cols-4 lg:divide-y-0">
          <UiStat label="Status" :value="dash.isLive.value ? 'Live' : 'Offline'" :tone="dash.isLive.value ? 'success' : undefined" />
          <UiStat label="Uptime" :value="dash.uptime.value ?? '—'" mono />
          <UiStat label="Destinations live" :value="`${dash.streaming.value.length}/${dash.enabled.value.length}`" mono />
          <UiStat label="Outgoing" :value="formatKbps(dash.totalKbps.value)" mono />
        </div>

        <UiPanel v-if="!setupDone" title="Get started" description="Three steps to go live everywhere at once." flush>
          <UiSteps :steps="steps" />
        </UiPanel>

        <HealthPanel v-if="dash.isLive.value || dash.health.value" />

        <UiPanel title="Destinations" description="Where your stream is sent." flush>
          <template #actions>
            <UButton label="Manage" to="/destinations" variant="ghost" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right" />
          </template>
          <div v-if="dash.pending.value" class="space-y-2 p-4">
            <USkeleton v-for="i in 3" :key="i" class="h-8" />
          </div>
          <UEmpty
            v-else-if="!dash.destinations.value.length"
            icon="i-lucide-radio-tower"
            title="No destinations yet"
            description="Connect YouTube, Twitch or Kick, or add any RTMP server."
            :actions="[{ label: 'Add destination', icon: 'i-lucide-plus', to: '/destinations' }]"
            variant="naked"
            class="py-8"
          />
          <ul v-else class="divide-y divide-default">
            <li v-for="d in dash.destinations.value" :key="d.id" class="flex items-center gap-3 px-4 py-2.5">
              <UiPlatformIcon :platform="d.platform" />
              <span class="flex-1 truncate text-sm" :class="d.enabled ? 'text-highlighted' : 'text-dimmed'">{{ d.name }}</span>
              <span class="hidden w-20 text-right font-mono text-xs tabular-nums text-muted sm:block">
                {{ d.enabled && d.status.state === 'live' ? formatKbps(d.status.bitrateKbps) : '' }}
              </span>
              <span class="flex w-28 justify-end">
                <UiStatus v-bind="destinationStatus(d.enabled, d.status.state, dash.isLive.value)" />
              </span>
            </li>
          </ul>
        </UiPanel>
      </div>
    </template>
  </UDashboardPanel>
</template>
