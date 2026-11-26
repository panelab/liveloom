<script setup lang="ts">
import type { DestinationView } from '~/composables/useDashboard'

const dash = useDashboard()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const modalOpen = ref(false)
const editing = ref<DestinationView | null>(null)
function openAdd() { editing.value = null; modalOpen.value = true }
function openEdit(d: DestinationView) { editing.value = d; modalOpen.value = true }

onMounted(() => {
  if (route.query.add) {
    openAdd()
    router.replace({ query: {} })
  }
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
      <UDashboardNavbar title="Destinations" :ui="{ root: 'h-12' }">
        <template #right>
          <UButton label="Add destination" icon="i-lucide-plus" @click="openAdd" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-4">
        <p class="text-sm text-muted">
          OBS uploads once to LiveLoom; each enabled destination gets a copy. Toggle one off to stop sending to it, even mid-stream.
        </p>

        <div v-if="dash.pending.value" class="space-y-2">
          <USkeleton v-for="i in 3" :key="i" class="h-14" />
        </div>

        <div v-else-if="!dash.destinations.value.length" class="rounded-lg border border-dashed border-default py-10">
          <UEmpty
            icon="i-lucide-radio-tower"
            title="No destinations yet"
            description="Add the platforms you want to go live on. You'll need each platform's stream key."
            :actions="[{ label: 'Add destination', icon: 'i-lucide-plus', onClick: openAdd }]"
            variant="naked"
          />
        </div>

        <div v-else class="overflow-hidden rounded-lg border border-default">
          <div class="hidden md:grid grid-cols-[1fr_9rem_7rem_6rem_5.5rem] gap-4 border-b border-default bg-elevated/40 px-4 py-2 section-label">
            <span>Destination</span><span>Status</span><span class="text-right">Bitrate</span><span class="text-right">Uptime</span><span class="text-right">Enabled</span>
          </div>
          <ul class="divide-y divide-default">
            <li
              v-for="d in dash.destinations.value"
              :key="d.id"
              class="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_9rem_7rem_6rem_5.5rem] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-elevated/30"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div class="grid size-8 shrink-0 place-items-center rounded-md border border-default bg-muted">
                  <UIcon :name="platformIcon[d.platform] ?? platformIcon.custom" class="size-4" :style="{ color: platformColor[d.platform] }" />
                </div>
                <div class="min-w-0">
                  <button class="block truncate text-sm font-medium text-highlighted hover:underline text-left" @click="openEdit(d)">{{ d.name }}</button>
                  <p class="truncate font-mono text-xs text-dimmed">{{ d.serverUrl }} · {{ d.streamKeyHint }}</p>
                </div>
              </div>

              <div class="col-start-1 md:col-start-auto flex items-center gap-1.5 text-xs" :class="destinationState(d.enabled, d.status.state, dash.isLive.value).text">
                <StatusDot :color="destinationState(d.enabled, d.status.state, dash.isLive.value).dot" :pulse="destinationState(d.enabled, d.status.state, dash.isLive.value).pulse" />
                {{ destinationState(d.enabled, d.status.state, dash.isLive.value).label }}
                <UTooltip v-if="d.enabled && d.status.message" :text="d.status.message">
                  <UIcon name="i-lucide-info" class="size-3.5 text-dimmed" />
                </UTooltip>
              </div>
              <span class="hidden md:block text-right font-mono text-xs tabular-nums text-muted">
                {{ d.enabled && d.status.state === 'live' ? formatKbps(d.status.bitrateKbps) : '—' }}
              </span>
              <span class="hidden md:block text-right font-mono text-xs tabular-nums text-muted">
                {{ d.enabled && d.status.startedAt ? formatDuration(dash.now.value - d.status.startedAt) : '—' }}
              </span>
              <div class="row-start-1 col-start-2 md:row-start-auto md:col-start-auto flex items-center justify-end gap-1">
                <USwitch :model-value="d.enabled" size="sm" :aria-label="`Toggle ${d.name}`" @update:model-value="(v: boolean) => toggle(d, v)" />
                <UDropdownMenu :items="rowMenu(d)" :content="{ align: 'end' }">
                  <UButton icon="i-lucide-ellipsis" variant="ghost" color="neutral" size="xs" aria-label="More" />
                </UDropdownMenu>
              </div>
              <p v-if="d.enabled && d.status.message && d.status.state !== 'live'" class="col-span-full md:hidden text-xs text-error break-words">{{ d.status.message }}</p>
            </li>
          </ul>
        </div>
      </div>

      <DestinationModal v-model:open="modalOpen" :editing="editing" @saved="dash.refresh()" />
    </template>
  </UDashboardPanel>
</template>
