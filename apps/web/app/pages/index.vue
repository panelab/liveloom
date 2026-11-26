<script setup lang="ts">
import type { Step } from '~/components/ui/Steps.vue'
import type { PlatformId } from '@sp/shared'

const dash = useDashboard()
const dialog = useDestinationDialog()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { data: connections, refresh: refreshConnections } = await useConnections()
const { data: chat } = await useChatConfig()

// Return from "Continue with …"
const connectError = ref<string | null>(null)
onMounted(() => {
  const q = route.query
  if (q.add) dialog.add()
  if (q.connected) {
    toast.add({ title: `${PLATFORM_NAMES[String(q.connected)] ?? q.connected} connected`, description: 'Stream key and chat are set up.', icon: 'i-lucide-check', color: 'success' })
    refreshConnections()
    dash.refresh()
  }
  if (q.connect_error) connectError.value = String(q.connect_error)
  if (q.add || q.connected || q.connect_error) router.replace({ query: {} })
})

const hasDest = computed(() => dash.destinations.value.length > 0)
const streamedBefore = computed(() => !!chat.value?.pluginSeen || dash.isLive.value || dash.destinations.value.some((d) => d.status.startedAt))
const steps = computed<Step[]>(() => [
  { title: 'Add where you stream', description: 'YouTube, Twitch, Kick or any RTMP server.', done: hasDest.value, onClick: () => dialog.add(), cta: 'Add destination' },
  { title: 'Pick how you go live', description: 'OBS with the LiveLoom plugin, or straight from this browser.', done: streamedBefore.value, to: '/setup', cta: 'Set up OBS' },
  { title: 'Go live', description: 'Every destination that’s on goes live together.', done: dash.isLive.value, to: '/studio', cta: 'Go live from browser' },
])
const setupDone = computed(() => steps.value.every((s) => s.done))

const headline = computed(() => {
  if (dash.isLive.value) return 'You’re live'
  if (!hasDest.value) return 'Welcome to LiveLoom'
  return 'Ready to go live'
})
const subline = computed(() => {
  if (dash.isLive.value) return `Sending to ${dash.streaming.value.length} of ${dash.enabled.value.length} destinations.`
  if (!hasDest.value) return 'Stream once and go live on every platform at the same time.'
  return `Start streaming in OBS or your browser, and ${dash.enabled.value.length === 1 ? 'your destination goes' : `all ${dash.enabled.value.length} destinations go`} live together.`
})

const quickAdd: { platform: PlatformId, label: string }[] = [
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'twitch', label: 'Twitch' },
  { platform: 'kick', label: 'Kick' },
  { platform: 'custom', label: 'Other' },
]
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Home">
        <template #right>
          <UTooltip text="Add destination" :kbds="['C']">
            <UButton label="Add destination" icon="i-lucide-plus" @click="dialog.add()" />
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-8 py-2">
        <!-- Status -->
        <div class="flex flex-wrap items-end justify-between gap-6">
          <div class="min-w-0">
            <div class="mb-2"><UiStatus :tone="dash.isLive.value ? 'live' : 'off'" :label="dash.isLive.value ? `Live · ${dash.uptime.value}` : 'Offline'" /></div>
            <h1 class="text-display">{{ headline }}</h1>
            <p class="mt-1.5 max-w-lg text-sm text-muted">{{ subline }}</p>
          </div>
          <div v-if="dash.isLive.value" class="flex gap-8">
            <UiStat label="Destinations" :value="`${dash.streaming.value.length}/${dash.enabled.value.length}`" mono />
            <UiStat label="Outgoing" :value="formatKbps(dash.totalKbps.value)" mono />
          </div>
          <div v-else-if="hasDest" class="flex gap-2">
            <UButton label="Go live from browser" icon="i-lucide-monitor-up" color="neutral" variant="outline" to="/studio" />
            <UButton label="OBS setup" icon="i-simple-icons-obsstudio" color="neutral" variant="ghost" to="/setup" />
          </div>
        </div>

        <UiCallout v-if="connectError" tone="error" title="Couldn’t connect" :description="connectError">
          <template #actions>
            <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" aria-label="Dismiss" @click="connectError = null" />
          </template>
        </UiCallout>

        <UiPanel v-if="!setupDone" title="Get started" flush>
          <UiSteps :steps="steps" />
        </UiPanel>

        <HealthPanel v-if="dash.isLive.value" />


        <!-- Destinations -->
        <UiPanel title="Destinations" flush>
          <template #actions>
            <UButton v-if="hasDest" icon="i-lucide-plus" label="Add" size="xs" variant="ghost" color="neutral" @click="dialog.add()" />
          </template>
          <div v-if="dash.pending.value" class="space-y-2 p-3">
            <USkeleton v-for="i in 3" :key="i" class="h-8" />
          </div>
          <div v-else-if="!hasDest" class="px-6 py-10 text-center">
            <p class="text-sm font-medium text-highlighted">Where do you stream?</p>
            <p class="mt-1 text-sm text-muted">Pick a platform to add it. You can add as many as you like.</p>
            <div class="mt-5 flex flex-wrap justify-center gap-2">
              <UButton
                v-for="q in quickAdd"
                :key="q.platform"
                :label="q.label"
                :icon="platformIcon[q.platform]"
                color="neutral"
                variant="outline"
                size="md"
                @click="dialog.add(q.platform)"
              />
            </div>
          </div>
          <DestinationList v-else />
          <template v-if="hasDest" #footer>
            Turn a destination off to stop sending to it, even mid-stream. Click a row to edit it.
          </template>
        </UiPanel>

        <StreamDetails />
      </div>
    </template>
  </UDashboardPanel>
</template>
