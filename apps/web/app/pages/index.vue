<script setup lang="ts">
import type { DestinationView } from '~/components/DestinationCard.vue'

const { user, clear } = useUserSession()
const toast = useToast()

const { data: channel, refresh: refreshChannel } = await useFetch('/api/channel')
const { data, refresh } = await useFetch('/api/destinations')

// Poll status while the tab is visible. The relay writes it to the DB every ~2s.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
    if (document.visibilityState === 'visible') refresh()
  }, 2000)
})
onBeforeUnmount(() => clearInterval(timer))

const isLive = computed(() => data.value?.isLive ?? false)
const destinations = computed(() => (data.value?.destinations ?? []) as DestinationView[])
const liveCount = computed(() => destinations.value.filter((d) => d.enabled && d.status.state === 'live').length)
const enabledCount = computed(() => destinations.value.filter((d) => d.enabled).length)

const modalOpen = ref(false)
const editing = ref<DestinationView | null>(null)
function openAdd() { editing.value = null; modalOpen.value = true }
function openEdit(d: DestinationView) { editing.value = d; modalOpen.value = true }

async function toggle(d: DestinationView, enabled: boolean) {
  d.enabled = enabled
  await $fetch(`/api/destinations/${d.id}`, { method: 'PATCH', body: { enabled } })
  refresh()
}

async function remove(d: DestinationView) {
  if (!confirm(`Delete “${d.name}”?`)) return
  await $fetch(`/api/destinations/${d.id}`, { method: 'DELETE' })
  toast.add({ title: `${d.name} removed` })
  refresh()
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-dvh bg-default">
    <header class="border-b border-default">
      <div class="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <img src="/icon.svg" alt="" class="size-7">
          <span class="font-semibold">Streaming Platform</span>
        </div>
        <div class="flex items-center gap-2">
          <UColorModeButton />
          <UDropdownMenu :items="[{ label: user?.email ?? '', type: 'label' }, { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: logout }]">
            <UButton icon="i-lucide-user" variant="ghost" color="neutral" aria-label="Account" />
          </UDropdownMenu>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <!-- Live status banner -->
      <div
        class="rounded-xl border p-4 flex flex-wrap items-center gap-4 justify-between"
        :class="isLive ? 'border-success/40 bg-success/5' : 'border-default bg-elevated/40'"
      >
        <div class="flex items-center gap-3">
          <span class="relative flex size-3">
            <span v-if="isLive" class="absolute inline-flex size-full rounded-full bg-success opacity-75 animate-ping" />
            <span class="relative inline-flex size-3 rounded-full" :class="isLive ? 'bg-success' : 'bg-muted'" />
          </span>
          <div>
            <p class="font-semibold">{{ isLive ? 'You are live' : 'Offline' }}</p>
            <p class="text-sm text-muted">
              <template v-if="isLive">
                {{ liveCount }} of {{ enabledCount }} destinations streaming
                <span v-if="data?.liveSince" class="tabular-nums"> · {{ formatDuration(now - data.liveSince) }}</span>
              </template>
              <template v-else>Start streaming in OBS and every enabled destination goes live.</template>
            </p>
          </div>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section class="space-y-3 min-w-0">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">Destinations</h2>
            <UButton label="Add destination" icon="i-lucide-plus" size="sm" @click="openAdd" />
          </div>

          <div v-if="!destinations.length" class="rounded-xl border border-dashed border-default p-8 text-center">
            <UIcon name="i-lucide-radio-tower" class="size-8 text-muted mx-auto" />
            <p class="mt-2 font-medium">No destinations yet</p>
            <p class="text-sm text-muted">Add YouTube, Twitch, Kick and more. You stream once and we send it to all of them.</p>
            <UButton class="mt-4" label="Add your first destination" icon="i-lucide-plus" @click="openAdd" />
          </div>

          <DestinationCard
            v-for="d in destinations"
            :key="d.id"
            :dest="d"
            :channel-live="isLive"
            :now="now"
            @edit="openEdit(d)"
            @toggle="(v) => toggle(d, v)"
            @remove="remove(d)"
          />
        </section>

        <aside class="space-y-6">
          <IngestCard
            v-if="channel"
            :ingest-url="channel.ingestUrl"
            :ingest-key="channel.ingestKey"
            :is-live="isLive"
            @rotated="refreshChannel"
          />
          <ChatCard />
        </aside>
      </div>
    </main>

    <DestinationModal v-model:open="modalOpen" :editing="editing" @saved="refresh" />
  </div>
</template>
