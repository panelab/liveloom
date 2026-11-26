<script setup lang="ts">
import { PLATFORMS, type PlatformId } from '@sp/shared'

/**
 * The one way to add a destination:
 *   1. pick a platform
 *   2. "Continue with <platform>" (sign in, everything filled in) when that
 *      platform's app is set up, or paste a stream key.
 */
const dialog = useDestinationDialog()
const dash = useDashboard()
const toast = useToast()
const { data: connections } = useConnections()

const open = computed({ get: () => dialog.state.value.open, set: (v) => (dialog.state.value.open = v) })
const editing = computed(() => dialog.state.value.editing)

const main: PlatformId[] = ['youtube', 'twitch', 'kick']
const more: PlatformId[] = ['facebook', 'tiktok', 'x', 'custom']
const step = ref<'pick' | 'details'>('pick')
const manual = ref(false)
const form = reactive({ platform: 'youtube' as PlatformId, name: '', serverUrl: '', streamKey: '' })
const saving = ref(false)
const preset = computed(() => PLATFORMS[form.platform])
const connection = computed(() => connections.value?.find((c) => c.platform === form.platform))
const canConnect = computed(() => !editing.value && !!connection.value?.available)

watch(() => dialog.state.value.open, (o) => {
  if (!o) return
  const d = dialog.state.value.editing
  const p = d?.platform ?? dialog.state.value.platform
  manual.value = !!d
  if (p) choose(p, d?.name, d?.serverUrl)
  else step.value = 'pick'
})

function choose(p: PlatformId, name?: string, serverUrl?: string) {
  form.platform = p
  form.name = name ?? PLATFORMS[p].name
  form.serverUrl = serverUrl ?? PLATFORMS[p].serverUrl
  form.streamKey = ''
  manual.value = !!editing.value || !connections.value?.find((c) => c.platform === p)?.available
  step.value = 'details'
}

async function save() {
  saving.value = true
  try {
    if (editing.value) {
      await $fetch(`/api/destinations/${editing.value.id}`, { method: 'PATCH', body: { name: form.name, serverUrl: form.serverUrl, streamKey: form.streamKey } })
    } else {
      await $fetch('/api/destinations', { method: 'POST', body: form })
    }
    toast.add({ title: editing.value ? 'Saved' : `${form.name} added`, icon: 'i-lucide-check', color: 'success', duration: 2000 })
    open.value = false
    dash.refresh()
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Could not save', color: 'error' })
  } finally {
    saving.value = false
  }
}

const title = computed(() => editing.value ? `Edit ${editing.value.name}` : step.value === 'pick' ? 'Add a destination' : `Add ${PLATFORMS[form.platform].name}`)
const description = computed(() => editing.value
  ? 'Changes apply right away, even while you’re live.'
  : step.value === 'pick' ? 'Where should your stream go?' : canConnect.value && !manual.value ? 'Sign in once. LiveLoom fills in your stream key and chat.' : 'Paste the stream key from the platform’s live settings.')
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="description" :ui="{ content: 'max-w-md' }">
    <template #body>
      <!-- Step 1: platform -->
      <div v-if="step === 'pick'" class="space-y-3">
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="p in main"
            :key="p"
            type="button"
            class="flex flex-col items-center gap-2 rounded-lg border border-default bg-default px-2 py-4 transition-colors hover:border-accented hover:bg-elevated"
            @click="choose(p)"
          >
            <UiPlatformIcon :platform="p" size="lg" tile />
            <span class="text-sm font-medium text-highlighted">{{ PLATFORMS[p].name }}</span>
            <span class="h-4 text-2xs" :class="connections?.find((c) => c.platform === p)?.available ? 'text-primary' : 'text-dimmed'">
              {{ connections?.find((c) => c.platform === p)?.available ? 'Sign in' : 'Stream key' }}
            </span>
          </button>
        </div>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="p in more"
            :key="p"
            type="button"
            class="flex items-center justify-center gap-1.5 rounded-md border border-default px-2 py-2 text-xs text-toned transition-colors hover:border-accented hover:bg-elevated"
            @click="choose(p)"
          >
            <UiPlatformIcon :platform="p" size="sm" />
            {{ p === 'custom' ? 'Other' : PLATFORMS[p].name }}
          </button>
        </div>
      </div>

      <!-- Step 2a: sign in -->
      <div v-else-if="canConnect && !manual" class="space-y-4">
        <UButton
          :to="`/api/connect/${form.platform}`"
          external
          block
          size="lg"
          :label="connection?.connected ? `Reconnect ${PLATFORMS[form.platform].name}` : `Continue with ${PLATFORMS[form.platform].name}`"
          :icon="platformIcon[form.platform]"
        />
        <ul class="space-y-1.5 text-sm text-muted">
          <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 size-4 text-success" />Stream key and server filled in for you</li>
          <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 size-4 text-success" />Your chat appears in LiveLoom and OBS</li>
          <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 size-4 text-success" />Read-only: LiveLoom can’t post or change anything</li>
        </ul>
        <div class="flex items-center gap-3 text-xs text-dimmed"><USeparator class="flex-1" />or<USeparator class="flex-1" /></div>
        <UButton label="Paste a stream key instead" variant="ghost" color="neutral" block @click="manual = true" />
      </div>

      <!-- Step 2b: stream key -->
      <form v-else id="dest-form" class="space-y-4" @submit.prevent="save">
        <UFormField label="Stream key" :hint="editing ? `Current: ${editing.streamKeyHint}` : undefined" :description="editing ? 'Leave empty to keep the current key.' : undefined">
          <UInput v-model="form.streamKey" type="password" :required="!editing" autocomplete="off" autofocus class="w-full" :ui="{ base: 'font-mono' }" placeholder="Paste here" />
          <template v-if="preset.keyHelpUrl" #help>
            <ULink :to="preset.keyHelpUrl" target="_blank" class="inline-flex items-center gap-1 text-xs">
              Where do I find my {{ preset.name }} stream key? <UIcon name="i-lucide-arrow-up-right" class="size-3" />
            </ULink>
          </template>
        </UFormField>
        <UFormField label="Server URL" :hint="preset.serverUrl && !editing ? 'Filled in for you' : undefined">
          <UInput v-model="form.serverUrl" required placeholder="rtmp://…" class="w-full" :ui="{ base: 'font-mono text-xs' }" />
        </UFormField>
        <UFormField label="Name">
          <UInput v-model="form.name" required maxlength="60" class="w-full" />
        </UFormField>
        <p class="flex items-center gap-1.5 text-xs text-dimmed">
          <UIcon name="i-lucide-lock" class="size-3.5" />Stream keys are encrypted before they’re saved.
        </p>
      </form>
    </template>

    <template v-if="step === 'details'" #footer>
      <div class="flex w-full items-center gap-2">
        <UButton v-if="!editing" label="Back" icon="i-lucide-chevron-left" variant="ghost" color="neutral" @click="step = 'pick'" />
        <div class="ml-auto flex gap-2">
          <UButton label="Cancel" variant="ghost" color="neutral" @click="open = false" />
          <UButton v-if="manual || !canConnect" type="submit" form="dest-form" :loading="saving" :label="editing ? 'Save' : 'Add destination'" />
        </div>
      </div>
    </template>
  </UModal>
</template>
