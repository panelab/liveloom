<script setup lang="ts">
import type { DestinationView } from '~/composables/useDashboard'

const dash = useDashboard()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { refresh: refreshConnections } = await useConnections()

const modalOpen = ref(false)
const editing = ref<DestinationView | null>(null)
function openAdd() { editing.value = null; modalOpen.value = true }
function openEdit(d: DestinationView) { editing.value = d; modalOpen.value = true }

const connectError = ref<string | null>(null)
onMounted(() => {
  const q = route.query
  if (q.add) openAdd()
  if (q.connected) {
    const name = { youtube: 'YouTube', twitch: 'Twitch', kick: 'Kick' }[String(q.connected)] ?? String(q.connected)
    toast.add({ title: `${name} connected`, description: 'Your destination and chat are ready.', icon: 'i-lucide-check', color: 'success' })
    refreshConnections()
    dash.refresh()
  }
  if (q.connect_error) connectError.value = String(q.connect_error)
  if (q.add || q.connected || q.connect_error) router.replace({ query: {} })
})

async function toggle(d: DestinationView, enabled: boolean) {
  d.enabled = enabled
  await $fetch(`/api/destinations/${d.id}`, { method: 'PATCH', body: { enabled } })
  dash.refresh()
}

async function remove(d: DestinationView) {
  if (!confirm(`Delete “${d.name}”?`)) return
  await $fetch(`/api/destinations/${d.id}`, { method: 'DELETE' })
  toast.add({ title: `${d.name} removed`, duration: 2000 })
  dash.refresh()
}

function rowMenu(d: DestinationView) {
  return [[
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(d) },
    { label: 'Copy server URL', icon: 'i-lucide-copy', onSelect: () => copyText(d.serverUrl, 'Server URL') },
  ], [
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(d) },
  ]]
}
</script>

<template>
  <UDashboardPanel id="destinations">
    <template #header>
      <UDashboardNavbar title="Destinations" :ui="{ root: 'h-14' }">
        <template #right>
          <UButton label="Add manually" icon="i-lucide-plus" variant="outline" color="neutral" @click="openAdd" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <UiPageIntro
          title="Destinations"
          description="OBS uploads once to LiveLoom, and each enabled destination gets a copy. Turn one off to stop sending to it, even mid-stream."
        />

        <UiCallout v-if="connectError" tone="error" title="Couldn’t connect" :description="connectError">
          <template #actions>
            <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" aria-label="Dismiss" @click="connectError = null" />
          </template>
        </UiCallout>

        <ConnectPanel />

        <UiPanel title="All destinations" flush>
          <div v-if="dash.pending.value" class="space-y-2 p-4">
            <USkeleton v-for="i in 3" :key="i" class="h-12" />
          </div>
          <UEmpty
            v-else-if="!dash.destinations.value.length"
            icon="i-lucide-radio-tower"
            title="No destinations yet"
            description="Connect an account above, or add any RTMP server manually."
            :actions="[{ label: 'Add manually', icon: 'i-lucide-plus', variant: 'outline', color: 'neutral', onClick: openAdd }]"
            variant="naked"
            class="py-10"
          />
          <template v-else>
            <div class="hidden grid-cols-[1fr_8rem_6rem_5rem_5rem] gap-4 border-b border-default px-4 py-2 label-caps md:grid">
              <span>Destination</span><span>Status</span><span class="text-right">Bitrate</span><span class="text-right">Uptime</span><span class="text-right">On</span>
            </div>
            <ul class="divide-y divide-default">
              <li
                v-for="d in dash.destinations.value"
                :key="d.id"
                class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-elevated/40 md:grid-cols-[1fr_8rem_6rem_5rem_5rem]"
              >
                <div class="flex min-w-0 items-center gap-3">
                  <UiPlatformIcon :platform="d.platform" tile />
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <button class="truncate text-left text-sm font-medium text-highlighted hover:underline" @click="openEdit(d)">{{ d.name }}</button>
                      <UTooltip v-if="d.connected" text="Managed by a connected account">
                        <UIcon name="i-lucide-link" class="size-3 text-dimmed" />
                      </UTooltip>
                    </div>
                    <p class="truncate font-mono text-xs text-dimmed">{{ d.serverUrl }} · {{ d.streamKeyHint }}</p>
                  </div>
                </div>
                <div class="col-start-1 flex items-center gap-1.5 md:col-start-auto">
                  <UiStatus v-bind="destinationStatus(d.enabled, d.status.state, dash.isLive.value)" />
                  <UTooltip v-if="d.enabled && d.status.message" :text="d.status.message">
                    <UIcon name="i-lucide-info" class="size-3.5 text-dimmed" />
                  </UTooltip>
                </div>
                <span class="hidden text-right font-mono text-xs tabular-nums text-muted md:block">
                  {{ d.enabled && d.status.state === 'live' ? formatKbps(d.status.bitrateKbps) : '—' }}
                </span>
                <span class="hidden text-right font-mono text-xs tabular-nums text-muted md:block">
                  {{ d.enabled && d.status.startedAt ? formatDuration(dash.now.value - d.status.startedAt) : '—' }}
                </span>
                <div class="col-start-2 row-start-1 flex items-center justify-end gap-1 md:col-start-auto md:row-start-auto">
                  <USwitch :model-value="d.enabled" size="sm" :aria-label="`Send to ${d.name}`" @update:model-value="(v: boolean) => toggle(d, v)" />
                  <UDropdownMenu :items="rowMenu(d)" :content="{ align: 'end' }">
                    <UButton icon="i-lucide-ellipsis" variant="ghost" color="neutral" size="xs" :aria-label="`${d.name} options`" />
                  </UDropdownMenu>
                </div>
                <p v-if="d.enabled && d.status.message && d.status.state !== 'live'" class="col-span-full break-words text-xs text-error md:hidden">{{ d.status.message }}</p>
              </li>
            </ul>
          </template>
        </UiPanel>
      </div>

      <DestinationModal v-model:open="modalOpen" :editing="editing" @saved="dash.refresh()" />
    </template>
  </UDashboardPanel>
</template>
