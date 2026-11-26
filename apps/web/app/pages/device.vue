<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const { user } = useUserSession()
const code = ref(String(route.query.code ?? '').toUpperCase())
const info = ref<{ userCode: string, clientName: string | null, status: string } | null>(null)
const error = ref<string | null>(null)
const busy = ref(false)
const done = ref<'approved' | 'denied' | null>(null)

function format(v: string) {
  const c = v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8)
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c
}
watch(code, (v) => { const f = format(v); if (f !== v) code.value = f })

async function lookup() {
  error.value = null
  busy.value = true
  try {
    info.value = await $fetch('/api/device/info', { query: { code: code.value } })
  } catch (e: any) {
    error.value = e?.data?.message ?? 'Code not found'
    info.value = null
  } finally {
    busy.value = false
  }
}

async function decide(approve: boolean) {
  busy.value = true
  try {
    await $fetch('/api/device/approve', { method: 'POST', body: { code: code.value, approve } })
    done.value = approve ? 'approved' : 'denied'
  } catch (e: any) {
    error.value = e?.data?.message ?? 'Something went wrong'
  } finally {
    busy.value = false
  }
}

onMounted(() => { if (code.value.replace('-', '').length === 8) lookup() })
</script>

<template>
  <div class="relative grid min-h-dvh place-items-center bg-surface-app px-4">
    
    <div class="relative w-full max-w-sm">
      <div class="mb-6 flex flex-col items-center gap-3 text-center">
        <div class="flex items-center gap-2">
          <AppLogo :size="36" />
          <UIcon name="i-lucide-arrow-left-right" class="size-4 text-dimmed" />
          <span class="grid size-9 place-items-center rounded-md border border-default bg-elevated">
            <UIcon name="i-simple-icons-obsstudio" class="size-5 text-highlighted" />
          </span>
        </div>
        <h1 class="text-lg font-semibold tracking-tight text-highlighted">Connect OBS to LiveLoom</h1>
        <p class="text-sm text-muted">Signed in as <span class="text-toned">{{ user?.email }}</span></p>
      </div>

      <div class="rounded-xl surface-raised p-5">
        <template v-if="done === 'approved'">
          <div class="flex flex-col items-center gap-2 py-4 text-center">
            <span class="grid size-10 place-items-center rounded-full bg-success/15 text-success"><UIcon name="i-lucide-check" class="size-5" /></span>
            <p class="text-base font-medium text-highlighted">OBS is connected</p>
            <p class="text-sm text-muted">Go back to OBS. Your stream settings and chat are ready.</p>
          </div>
        </template>
        <template v-else-if="done === 'denied'">
          <div class="py-4 text-center text-sm text-muted">Sign-in was cancelled. You can close this page.</div>
        </template>
        <template v-else-if="info">
          <p class="text-sm text-muted">Make sure this code matches the one shown in OBS:</p>
          <p class="my-4 text-center font-mono text-2xl font-semibold tracking-[0.2em] text-highlighted">{{ info.userCode }}</p>
          <UiCallout tone="info" title="OBS will be able to" description="Read your merged chat, and get your LiveLoom server and stream key to fill in its stream settings." />
          <UiCallout v-if="error" tone="error" :title="error" class="mt-3" />
          <div class="mt-4 grid grid-cols-2 gap-2">
            <UButton label="Cancel" variant="outline" color="neutral" block size="md" :disabled="busy" @click="decide(false)" />
            <UButton label="Approve" block size="md" :loading="busy" @click="decide(true)" />
          </div>
        </template>
        <form v-else class="space-y-3" @submit.prevent="lookup">
          <UFormField label="Code from OBS">
            <UInput
              v-model="code"
              placeholder="XXXX-XXXX"
              autofocus
              autocomplete="off"
              size="lg"
              class="w-full"
              :ui="{ base: 'text-center font-mono text-lg tracking-[0.2em] uppercase' }"
            />
          </UFormField>
          <UiCallout v-if="error" tone="error" :title="error" />
          <UButton type="submit" label="Continue" block size="md" :loading="busy" :disabled="code.replace('-', '').length !== 8" />
        </form>
      </div>
    </div>
  </div>
</template>
