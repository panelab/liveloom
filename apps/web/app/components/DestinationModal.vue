<script setup lang="ts">
import { PLATFORMS, type PlatformId } from '@sp/shared'
import type { DestinationView } from '~/composables/useDashboard'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ editing: DestinationView | null }>()
const emit = defineEmits<{ saved: [] }>()
const toast = useToast()

const platformOrder: PlatformId[] = ['youtube', 'twitch', 'kick', 'facebook', 'tiktok', 'x', 'custom']
const form = reactive({ platform: 'youtube' as PlatformId, name: '', serverUrl: '', streamKey: '' })
const saving = ref(false)
const preset = computed(() => PLATFORMS[form.platform])

watch(open, (o) => {
  if (!o) return
  const d = props.editing
  form.platform = d?.platform ?? 'youtube'
  form.name = d?.name ?? PLATFORMS[form.platform].name
  form.serverUrl = d?.serverUrl ?? PLATFORMS[form.platform].serverUrl
  form.streamKey = ''
})

function pick(p: PlatformId) {
  if (props.editing) return
  if (!form.name || form.name === PLATFORMS[form.platform].name) form.name = PLATFORMS[p].name
  form.platform = p
  form.serverUrl = PLATFORMS[p].serverUrl
}

async function save() {
  saving.value = true
  try {
    if (props.editing) {
      await $fetch(`/api/destinations/${props.editing.id}`, { method: 'PATCH', body: { name: form.name, serverUrl: form.serverUrl, streamKey: form.streamKey } })
    } else {
      await $fetch('/api/destinations', { method: 'POST', body: form })
    }
    toast.add({ title: props.editing ? 'Destination saved' : `${form.name} added`, icon: 'i-lucide-check', color: 'success', duration: 2000 })
    open.value = false
    emit('saved')
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Could not save', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="editing ? `Edit ${editing.name}` : 'Add destination'"
    :description="editing ? 'Changes apply immediately, even while live.' : 'Pick a platform and paste its stream key.'"
    :ui="{ content: 'max-w-lg' }"
  >
    <template #body>
      <form id="dest-form" class="space-y-4" @submit.prevent="save">
        <div v-if="!editing" class="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          <button
            v-for="p in platformOrder"
            :key="p"
            type="button"
            class="flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[11px] transition-colors"
            :class="form.platform === p ? 'border-(--ui-border-inverted) bg-elevated text-highlighted' : 'border-default text-muted hover:bg-elevated/60'"
            @click="pick(p)"
          >
            <UIcon :name="platformIcon[p]" class="size-4" :style="{ color: platformColor[p] }" />
            <span class="truncate w-full text-center">{{ PLATFORMS[p].name.replace(' RTMP', '') }}</span>
          </button>
        </div>

        <UFormField label="Name">
          <UInput v-model="form.name" required maxlength="60" class="w-full" />
        </UFormField>
        <UFormField label="Server URL" :hint="preset.serverUrl ? 'Prefilled' : 'From the platform\'s live settings'">
          <UInput v-model="form.serverUrl" required placeholder="rtmp://…" class="w-full" :ui="{ base: 'font-mono text-[13px]' }" />
        </UFormField>
        <UFormField label="Stream key" :hint="editing ? `Current: ${editing.streamKeyHint}` : undefined" :description="editing ? 'Leave empty to keep the current key.' : undefined">
          <UInput v-model="form.streamKey" type="password" :required="!editing" autocomplete="off" class="w-full" :ui="{ base: 'font-mono text-[13px]' }" />
          <template v-if="preset.keyHelpUrl" #help>
            <ULink :to="preset.keyHelpUrl" target="_blank" class="text-xs inline-flex items-center gap-1">
              Find your {{ preset.name }} stream key <UIcon name="i-lucide-arrow-up-right" class="size-3" />
            </ULink>
          </template>
        </UFormField>
        <p class="flex items-center gap-1.5 text-xs text-dimmed">
          <UIcon name="i-lucide-lock" class="size-3.5" />Stream keys are encrypted before they're saved.
        </p>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" variant="ghost" color="neutral" @click="open = false" />
        <UButton type="submit" form="dest-form" :loading="saving" :label="editing ? 'Save' : 'Add destination'" />
      </div>
    </template>
  </UModal>
</template>
