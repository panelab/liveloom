<script setup lang="ts">
import type { ChatEvent, ChatMessage, ChatSourceStatus } from '@sp/shared'

const toast = useToast()
const config = useRuntimeConfig()
const { data, refresh } = await useFetch('/api/chat')

const form = reactive({ twitch: '', kick: '', youtube: '' })
watch(data, (d) => d && Object.assign(form, { twitch: d.twitch, kick: d.kick, youtube: d.youtube }), { immediate: true })

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch('/api/chat', { method: 'PUT', body: form })
    toast.add({ title: 'Chat sources saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: e?.data?.data?.issues?.[0]?.message ?? e?.data?.message ?? 'Could not save', color: 'error' })
  } finally {
    saving.value = false
  }
}

const serverUrl = computed(() => config.public.chatServerUrl || (import.meta.client ? location.origin : ''))
const reveal = ref(false)
async function copy(text: string, what: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: `${what} copied`, icon: 'i-lucide-check', color: 'success' })
}
async function rotate() {
  if (!confirm('Reset the plugin token? The OBS plugin will need the new one.')) return
  await $fetch('/api/chat/rotate', { method: 'POST' })
  await refresh()
  connect()
}

// Live preview of the merged feed (same stream the OBS plugin reads).
const messages = ref<ChatMessage[]>([])
const sources = ref<ChatSourceStatus[]>([])
let es: EventSource | null = null
function connect() {
  es?.close()
  if (!data.value?.token) return
  es = new EventSource(`${serverUrl.value}/chat/events?token=${encodeURIComponent(data.value.token)}`)
  const on = (e: MessageEvent) => {
    const ev = JSON.parse(e.data) as ChatEvent
    if (ev.type === 'hello') { messages.value = ev.history.slice(-50); sources.value = ev.sources }
    else if (ev.type === 'status') sources.value = ev.sources
    else if (ev.type === 'message') {
      messages.value.push(ev.message)
      if (messages.value.length > 50) messages.value.shift()
      nextTick(() => list.value?.scrollTo({ top: list.value.scrollHeight }))
    }
  }
  for (const t of ['hello', 'status', 'message']) es.addEventListener(t, on as EventListener)
}
const list = ref<HTMLElement>()
onMounted(connect)
onBeforeUnmount(() => es?.close())

const stateColor = { connected: 'success', connecting: 'info', offline: 'neutral', error: 'error', off: 'neutral' } as const
const stateLabel = { connected: 'Connected', connecting: 'Connecting', offline: 'Not live', error: 'Error', off: 'Off' } as const
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <div>
          <h2 class="font-semibold">Merged chat</h2>
          <p class="text-sm text-muted">Twitch, Kick and YouTube in one feed, shown in the OBS plugin.</p>
        </div>
        <UIcon name="i-lucide-messages-square" class="size-5 text-muted" />
      </div>
    </template>

    <div class="space-y-5">
      <form class="space-y-3" @submit.prevent="save">
        <UFormField label="Twitch username">
          <UInput v-model="form.twitch" placeholder="yourname" icon="i-simple-icons-twitch" class="w-full" />
        </UFormField>
        <UFormField label="Kick username">
          <UInput v-model="form.kick" placeholder="yourname" icon="i-simple-icons-kick" class="w-full" />
        </UFormField>
        <UFormField label="YouTube handle" hint="@handle, channel ID or video link">
          <UInput v-model="form.youtube" placeholder="@yourchannel" icon="i-simple-icons-youtube" class="w-full" />
        </UFormField>
        <UButton type="submit" label="Save chat sources" size="sm" :loading="saving" />
      </form>

      <div v-if="sources.length" class="flex flex-wrap gap-2">
        <UBadge
          v-for="s in sources.filter((s) => s.target)"
          :key="s.platform"
          :color="stateColor[s.state]"
          variant="subtle"
          :title="s.message"
        >
          <UIcon :name="platformIcon[s.platform]" class="size-3.5" />
          {{ stateLabel[s.state] }}
        </UBadge>
      </div>

      <div ref="list" class="h-56 overflow-y-auto rounded-lg border border-default bg-elevated/40 p-2 space-y-1 text-sm">
        <p v-if="!messages.length" class="text-muted text-center pt-20">Chat messages appear here when you're live.</p>
        <div v-for="m in messages" :key="m.id" class="flex gap-1.5 items-start leading-snug">
          <UIcon :name="platformIcon[m.platform]" class="size-3.5 mt-0.5 shrink-0" :class="{ 'text-[#9146ff]': m.platform === 'twitch', 'text-[#53fc18]': m.platform === 'kick', 'text-[#ff0033]': m.platform === 'youtube' }" />
          <p class="min-w-0 break-words">
            <span class="font-semibold" :style="m.author.color ? { color: m.author.color } : undefined">{{ m.author.name }}</span>
            <span v-if="m.amount" class="ms-1 rounded bg-warning/20 px-1 text-xs">{{ m.amount }}</span>
            <span class="text-muted">: </span>
            <template v-for="(p, i) in m.parts" :key="i">
              <img v-if="p.t === 'emote'" :src="p.url" :alt="p.name" :title="p.name" class="inline h-5 align-middle">
              <span v-else>{{ p.v }}</span>
            </template>
          </p>
        </div>
      </div>

      <USeparator label="OBS plugin" />
      <div class="space-y-3">
        <UFormField label="Server">
          <UInput :model-value="serverUrl" readonly class="w-full font-mono" :ui="{ trailing: 'pe-1' }">
            <template #trailing>
              <UButton icon="i-lucide-copy" size="sm" variant="ghost" color="neutral" aria-label="Copy server" @click="copy(serverUrl, 'Server')" />
            </template>
          </UInput>
        </UFormField>
        <UFormField label="Plugin token">
          <UInput :model-value="data?.token ?? ''" :type="reveal ? 'text' : 'password'" readonly class="w-full font-mono" :ui="{ trailing: 'pe-1' }">
            <template #trailing>
              <UButton :icon="reveal ? 'i-lucide-eye-off' : 'i-lucide-eye'" size="sm" variant="ghost" color="neutral" aria-label="Show token" @click="reveal = !reveal" />
              <UButton icon="i-lucide-copy" size="sm" variant="ghost" color="neutral" aria-label="Copy token" @click="copy(data?.token ?? '', 'Plugin token')" />
            </template>
          </UInput>
        </UFormField>
        <div class="flex justify-end">
          <UButton label="Reset token" size="sm" variant="soft" color="neutral" icon="i-lucide-rotate-ccw" @click="rotate" />
        </div>
      </div>
    </div>
  </UCard>
</template>
