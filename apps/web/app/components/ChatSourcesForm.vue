<script setup lang="ts">
import type { ChatSourceStatus } from '@sp/shared'

const props = defineProps<{ sources: ChatSourceStatus[] }>()
const toast = useToast()
const { data, refresh } = await useChatConfig()

const form = reactive({ twitch: '', kick: '', youtube: '' })
watch(data, (d) => d && Object.assign(form, { twitch: d.twitch, kick: d.kick, youtube: d.youtube }), { immediate: true })
const dirty = computed(() => !!data.value && (form.twitch !== data.value.twitch || form.kick !== data.value.kick || form.youtube !== data.value.youtube))

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch('/api/chat', { method: 'PUT', body: form })
    await refresh()
    toast.add({ title: 'Chat sources saved', icon: 'i-lucide-check', color: 'success', duration: 2000 })
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Could not save', color: 'error' })
  } finally {
    saving.value = false
  }
}

const fields = [
  { key: 'twitch', label: 'Twitch', placeholder: 'username', icon: 'i-simple-icons-twitch', color: '#9146ff' },
  { key: 'kick', label: 'Kick', placeholder: 'username', icon: 'i-simple-icons-kick', color: '#53fc18' },
  { key: 'youtube', label: 'YouTube', placeholder: '@handle or video link', icon: 'i-simple-icons-youtube', color: '#ff0033' },
] as const

const stateTone: Record<string, { label: string, tone: 'live' | 'info' | 'off' | 'error' }> = {
  connected: { label: 'Connected', tone: 'live' },
  connecting: { label: 'Connecting', tone: 'info' },
  offline: { label: 'Not live', tone: 'off' },
  error: { label: 'Error', tone: 'error' },
  off: { label: 'Off', tone: 'off' },
}
const statusOf = (p: string) => props.sources.find((s) => s.platform === p)
</script>

<template>
  <form class="space-y-4" @submit.prevent="save">
    <div v-for="f in fields" :key="f.key" class="space-y-1.5">
      <div class="flex items-center justify-between">
        <label :for="`chat-${f.key}`" class="flex items-center gap-1.5 text-sm font-medium text-toned">
          <UiPlatformIcon :platform="f.key" size="sm" />{{ f.label }}
        </label>
        <UTooltip v-if="statusOf(f.key)?.target" :text="statusOf(f.key)?.message || statusOf(f.key)?.target || ''">
          <UiStatus :tone="stateTone[statusOf(f.key)!.state]?.tone ?? 'off'" :label="stateTone[statusOf(f.key)!.state]?.label" :pulse="statusOf(f.key)!.state === 'connecting'" />
        </UTooltip>
      </div>
      <UInput :id="`chat-${f.key}`" v-model="form[f.key]" :placeholder="f.placeholder" class="w-full" />
    </div>
    <UButton type="submit" label="Save" block :loading="saving" :disabled="!dirty" :variant="dirty ? 'solid' : 'outline'" :color="dirty ? 'primary' : 'neutral'" />
    <p class="text-xs text-dimmed">
      Reading chat needs no login. Connected accounts fill these in for you. YouTube chat appears only while you're live.
    </p>
  </form>
</template>
