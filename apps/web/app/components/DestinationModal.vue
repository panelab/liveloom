<script setup lang="ts">
import { PLATFORMS, type PlatformId } from '@sp/shared'
import type { DestinationView } from './DestinationCard.vue'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ editing: DestinationView | null }>()
const emit = defineEmits<{ saved: [] }>()
const toast = useToast()

const platformItems = Object.values(PLATFORMS).map((p) => ({ label: p.name, value: p.id, icon: platformIcon[p.id] }))
const form = reactive({ platform: 'youtube' as PlatformId, name: '', serverUrl: '', streamKey: '' })
const saving = ref(false)

watch(open, (o) => {
  if (!o) return
  const d = props.editing
  form.platform = (d?.platform as PlatformId) ?? 'youtube'
  form.name = d?.name ?? PLATFORMS[form.platform].name
  form.serverUrl = d?.serverUrl ?? PLATFORMS[form.platform].serverUrl
  form.streamKey = ''
})

watch(() => form.platform, (p, old) => {
  if (props.editing) return
  if (!form.name || form.name === PLATFORMS[old].name) form.name = PLATFORMS[p].name
  form.serverUrl = PLATFORMS[p].serverUrl
})

const preset = computed(() => PLATFORMS[form.platform])

async function save() {
  saving.value = true
  try {
    if (props.editing) {
      await $fetch(`/api/destinations/${props.editing.id}`, {
        method: 'PATCH',
        body: { name: form.name, serverUrl: form.serverUrl, streamKey: form.streamKey },
      })
    } else {
      await $fetch('/api/destinations', { method: 'POST', body: form })
    }
    open.value = false
    emit('saved')
  } catch (e: any) {
    const issue = e?.data?.data?.issues?.[0]?.message ?? e?.data?.message
    toast.add({ title: issue ?? 'Could not save', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="editing ? 'Edit destination' : 'Add destination'">
    <template #body>
      <form id="dest-form" class="space-y-4" @submit.prevent="save">
        <UFormField label="Platform">
          <USelect v-model="form.platform" :items="platformItems" :disabled="!!editing" class="w-full" />
        </UFormField>
        <UFormField label="Name">
          <UInput v-model="form.name" required maxlength="60" class="w-full" />
        </UFormField>
        <UFormField label="Server URL" :hint="preset.serverUrl ? 'Prefilled' : 'From the platform\'s live settings'">
          <UInput v-model="form.serverUrl" required placeholder="rtmp://…" class="w-full font-mono" />
        </UFormField>
        <UFormField
          label="Stream key"
          :hint="editing ? `Current: ${editing.streamKeyHint}` : undefined"
          :description="editing ? 'Leave empty to keep the current key.' : undefined"
        >
          <UInput
            v-model="form.streamKey"
            type="password"
            :required="!editing"
            autocomplete="off"
            class="w-full font-mono"
          />
          <template v-if="preset.keyHelpUrl" #help>
            <ULink :to="preset.keyHelpUrl" target="_blank" class="text-xs">Where do I find my {{ preset.name }} key?</ULink>
          </template>
        </UFormField>
        <p class="text-xs text-muted flex items-center gap-1">
          <UIcon name="i-lucide-lock" />Stream keys are encrypted before they are saved.
        </p>
      </form>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="Cancel" variant="ghost" color="neutral" @click="open = false" />
        <UButton type="submit" form="dest-form" :loading="saving" :label="editing ? 'Save' : 'Add destination'" />
      </div>
    </template>
  </UModal>
</template>
