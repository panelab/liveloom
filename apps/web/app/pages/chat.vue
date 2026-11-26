<script setup lang="ts">
import type { ChatPlatform } from '@sp/shared'

const { data: chatConfig } = await useChatConfig()
const token = computed(() => chatConfig.value?.token)
const { messages, sources, connected } = useChatStream(token)

const filter = ref<'all' | ChatPlatform>('all')
const shown = computed(() => (filter.value === 'all' ? messages.value : messages.value.filter((m) => m.platform === filter.value)))
const counts = computed(() => {
  const c: Record<string, number> = { all: messages.value.length }
  for (const m of messages.value) c[m.platform] = (c[m.platform] ?? 0) + 1
  return c
})
const tabs = computed(() => [
  { label: 'All', value: 'all' },
  { label: 'Twitch', value: 'twitch', icon: 'i-simple-icons-twitch' },
  { label: 'Kick', value: 'kick', icon: 'i-simple-icons-kick' },
  { label: 'YouTube', value: 'youtube', icon: 'i-simple-icons-youtube' },
])

// Stick to the bottom unless the user scrolled up to read.
const scroller = ref<HTMLElement>()
const atBottom = ref(true)
function onScroll() {
  const el = scroller.value
  if (el) atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}
function toBottom() {
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
  atBottom.value = true
}
watch(() => shown.value.length, () => nextTick(() => atBottom.value && toBottom()))
watch(filter, () => nextTick(toBottom))

const sourcesOpen = ref(false)
const configured = computed(() => sources.value.filter((s) => s.target))
const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <UDashboardPanel id="chat" :ui="{ body: 'p-0 sm:p-0 gap-0' }">
    <template #header>
      <UDashboardNavbar title="Chat" :ui="{ root: 'h-12' }">
        <template #trailing>
          <span class="flex items-center gap-1.5 text-xs text-dimmed">
            <StatusDot :color="connected ? 'bg-success' : 'bg-(--ui-text-dimmed)'" />
            {{ connected ? `${configured.length} source${configured.length === 1 ? '' : 's'}` : 'Connecting…' }}
          </span>
        </template>
        <template #right>
          <UButton class="lg:hidden" label="Sources" icon="i-lucide-sliders-horizontal" variant="outline" color="neutral" @click="sourcesOpen = true" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <UTabs v-model="filter" :items="tabs" :content="false" size="xs" variant="link" class="-mb-px">
          <template #trailing="{ item }">
            <span class="ml-1 font-mono text-[10px] text-dimmed">{{ counts[item.value as string] ?? 0 }}</span>
          </template>
        </UTabs>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="relative flex-1 min-h-0">
        <div ref="scroller" class="absolute inset-0 overflow-y-auto px-4 py-3" @scroll="onScroll">
          <UEmpty
            v-if="!shown.length"
            icon="i-lucide-messages-square"
            :title="configured.length ? 'Waiting for messages' : 'No chat sources yet'"
            :description="configured.length ? 'Messages from your channels appear here as they come in.' : 'Add your Twitch, Kick or YouTube channel to merge their chats here and in OBS.'"
            :actions="configured.length ? [] : [{ label: 'Add sources', icon: 'i-lucide-plus', class: 'lg:hidden', onClick: () => (sourcesOpen = true) }]"
            variant="naked"
            class="h-full"
          />
          <ul v-else class="space-y-0.5">
            <li v-for="m in shown" :key="m.id" class="group flex gap-2 rounded-md px-2 py-1 hover:bg-elevated/50 text-sm leading-relaxed">
              <UIcon :name="platformIcon[m.platform]" class="mt-1 size-3.5 shrink-0" :style="{ color: platformColor[m.platform] }" />
              <p class="min-w-0 flex-1 break-words">
                <span class="font-semibold" :style="m.author.color ? { color: m.author.color } : undefined">{{ m.author.name }}</span>
                <span v-if="m.amount" class="ml-1.5 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">{{ m.amount }}</span>
                <span class="text-dimmed">: </span>
                <template v-for="(p, i) in m.parts" :key="i">
                  <img v-if="p.t === 'emote'" :src="p.url" :alt="p.name" :title="p.name" class="inline h-6 align-middle" loading="lazy">
                  <span v-else class="text-default">{{ p.v }}</span>
                </template>
              </p>
              <span class="mt-0.5 shrink-0 font-mono text-[10px] text-dimmed opacity-0 group-hover:opacity-100">{{ time(m.ts) }}</span>
            </li>
          </ul>
        </div>
        <UButton
          v-if="!atBottom"
          label="New messages"
          icon="i-lucide-arrow-down"
          size="xs"
          class="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-lg"
          @click="toBottom"
        />
      </div>
    </template>
  </UDashboardPanel>

  <!-- Sources: side panel on desktop, slideover on mobile -->
  <UDashboardPanel id="chat-sources" :default-size="20" :min-size="18" :max-size="26" resizable class="hidden lg:flex" :ui="{ body: 'gap-6' }">
    <template #header>
      <UDashboardNavbar title="Sources" :toggle="false" :ui="{ root: 'h-12' }" />
    </template>
    <template #body>
      <ChatSourcesForm :sources="sources" />
      <div class="space-y-2">
        <p class="section-label">Show in OBS</p>
        <p class="text-xs text-muted">Install the Multichat plugin and paste your plugin token from <ULink to="/setup" class="text-highlighted underline">Setup</ULink>.</p>
      </div>
    </template>
  </UDashboardPanel>

  <USlideover v-model:open="sourcesOpen" title="Chat sources" class="lg:hidden">
    <template #body>
      <ChatSourcesForm :sources="sources" />
    </template>
  </USlideover>
</template>
