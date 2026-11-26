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

const stateText: Record<string, { label: string, dot: string }> = {
  connected: { label: 'Connected', dot: 'bg-success' },
  connecting: { label: 'Connecting', dot: 'bg-info' },
  offline: { label: 'Not live', dot: 'bg-(--ui-text-dimmed)' },
  error: { label: 'Error', dot: 'bg-error' },
  off: { label: 'Off', dot: 'bg-(--ui-text-dimmed)' },
}
const statusOf = (p: string) => props.sources.find((s) => s.platform === p)
</script>

<template>
  <form class="space-y-4" @submit.prevent="save">
    <div v-for="f in fields" :key="f.key" class="space-y-1.5">
      <div class="flex items-center justify-between">
        <label :for="`chat-${f.key}`" class="flex items-center gap-1.5 text-xs font-medium text-muted">
          <UIcon :name="f.icon" class="size-3.5" :style="{ color: f.color }" />{{ f.label }}
        </label>
        <UTooltip v-if="statusOf(f.key)?.target" :text="statusOf(f.key)?.message || statusOf(f.key)?.target || ''">
          <span class="flex items-center gap-1.5 text-[11px] text-dimmed">
            <StatusDot :color="stateText[statusOf(f.key)!.state]?.dot ?? 'bg-muted'" :pulse="statusOf(f.key)!.state === 'connecting'" />
            {{ stateText[statusOf(f.key)!.state]?.label }}
          </span>
        </UTooltip>
      </div>
      <UInput :id="`chat-${f.key}`" v-model="form[f.key]" :placeholder="f.placeholder" class="w-full" />
    </div>
    <UButton type="submit" label="Save" block :loading="saving" :disabled="!dirty" />
    <p class="text-xs text-dimmed">
      Reading chat needs no login. YouTube only shows chat while you're live.
    </p>
  </form>
</template>
