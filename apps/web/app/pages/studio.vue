<script setup lang="ts">
import type { Quality, SourceMode } from '~/composables/useBrowserStream'

const dash = useDashboard()
const origin = useSiteOrigin()
const { data: channel } = await useChannel()
const s = useBrowserStream()
const videoEl = ref<HTMLVideoElement>()

watch(() => s.preview.value, (stream) => {
  if (videoEl.value) videoEl.value.srcObject = stream
}, { flush: 'post' })

const modes: { label: string, value: SourceMode, icon: string }[] = [
  { label: 'Screen', value: 'screen', icon: 'i-lucide-monitor' },
  { label: 'Camera', value: 'camera', icon: 'i-lucide-video' },
  { label: 'Screen + camera', value: 'both', icon: 'i-lucide-picture-in-picture-2' },
]
const qualities: { label: string, value: Quality }[] = [
  { label: '720p · 3.5 Mbps', value: '720p' },
  { label: '1080p · 6 Mbps', value: '1080p' },
]
// "default" stands in for "let the browser choose" (selects can't show an undefined value).
const micItems = computed(() => [{ label: 'Default microphone', value: 'default' }, ...s.devices.value.mics.filter((d) => d.deviceId !== 'default').map((d) => ({ label: d.label || 'Microphone', value: d.deviceId }))])
const camItems = computed(() => [{ label: 'Default camera', value: 'default' }, ...s.devices.value.cams.filter((d) => d.deviceId !== 'default').map((d) => ({ label: d.label || 'Camera', value: d.deviceId }))])

const busy = computed(() => s.state.value === 'connecting')
const live = computed(() => s.state.value === 'live')
const capturing = computed(() => !!s.preview.value)
// Someone else (OBS) is already streaming to this channel.
const otherLive = computed(() => dash.isLive.value && !live.value && !busy.value)

async function goLive() {
  if (otherLive.value && !confirm('OBS (or another tab) is already streaming to LiveLoom. Going live here replaces that stream. Continue?')) return
  await s.goLive(`${origin.value}/whip/live/${channel.value?.ingestKey}/whip`)
}

const uptime = computed(() => (s.startedAt.value ? formatDuration(dash.now.value - s.startedAt.value) : null))
const supported = ref(true)
onMounted(() => { supported.value = !!navigator.mediaDevices?.getDisplayMedia && 'RTCPeerConnection' in window })
</script>

<template>
  <UDashboardPanel id="studio">
    <template #header>
      <UDashboardNavbar title="Studio" :ui="{ root: 'h-14' }">
        <template #trailing>
          <UBadge label="Beta" variant="subtle" color="neutral" />
        </template>
        <template #right>
          <span v-if="live" class="hidden items-center gap-3 font-mono text-xs tabular-nums text-muted sm:flex">
            <span>{{ uptime }}</span>
            <span>{{ formatKbps(s.kbps.value) }}</span>
          </span>
          <UButton
            v-if="live || busy"
            label="End stream"
            icon="i-lucide-square"
            color="error"
            :loading="busy"
            @click="s.stop()"
          />
          <UButton v-else label="Go live" icon="i-lucide-radio" :disabled="!capturing" @click="goLive" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1fr_18rem]">
        <div class="min-w-0 space-y-4">
          <UiPageIntro title="Go live from your browser" description="No OBS needed. Share your screen, camera or both, and LiveLoom sends it to every enabled destination." />

          <UiCallout v-if="!supported" tone="error" title="This browser can’t stream" description="Use a recent version of Chrome, Edge, Firefox or Safari on a computer." />
          <UiCallout v-if="s.error.value" tone="error" :title="s.error.value" />
          <UiCallout
            v-if="otherLive"
            tone="warning"
            title="You’re already live from OBS"
            description="Going live here replaces the OBS stream on every destination."
          />

          <!-- Preview -->
          <div class="relative aspect-video overflow-hidden rounded-lg border border-default bg-black">
            <video ref="videoEl" autoplay muted playsinline class="size-full object-contain" />
            <div v-if="!capturing" class="absolute inset-0 grid place-items-center">
              <div class="flex flex-col items-center gap-3 text-center">
                <UIcon name="i-lucide-monitor-play" class="size-8 text-dimmed" />
                <p class="text-sm text-muted">Choose a source, then start your preview.</p>
                <UButton label="Start preview" icon="i-lucide-play" :disabled="!supported" @click="s.startPreview()" />
              </div>
            </div>
            <div v-if="live" class="absolute left-3 top-3 flex items-center gap-2 rounded-md bg-black/70 px-2 py-1">
              <UiStatus tone="live" label="LIVE" />
              <span class="font-mono text-xs tabular-nums text-white/80">{{ uptime }}</span>
            </div>
            <div v-else-if="busy" class="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1">
              <UiStatus tone="info" label="Connecting…" />
            </div>
          </div>

          <!-- Source controls -->
          <UiPanel flush>
            <div class="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
              <div class="flex flex-col gap-1.5">
                <span class="label-caps">Source</span>
                <div class="flex rounded-md border border-default p-0.5">
                  <UButton
                    v-for="m in modes"
                    :key="m.value"
                    :label="m.label"
                    :icon="m.icon"
                    size="xs"
                    :variant="s.mode.value === m.value ? 'solid' : 'ghost'"
                    color="neutral"
                    :disabled="live || busy"
                    @click="s.mode.value = m.value"
                  />
                </div>
              </div>
              <div class="flex flex-col gap-1.5">
                <span class="label-caps">Quality</span>
                <USelect v-model="s.quality.value" :items="qualities" size="sm" class="w-40" :disabled="live || busy" />
              </div>
              <div v-if="s.mode.value !== 'screen'" class="flex flex-col gap-1.5">
                <span class="label-caps">Camera</span>
                <USelect v-model="s.camId.value" :items="camItems" size="sm" class="w-48" :disabled="live || busy" />
              </div>
              <div class="flex flex-col gap-1.5">
                <span class="label-caps">Microphone</span>
                <div class="flex items-center gap-2">
                  <USwitch v-model="s.micOn.value" size="sm" :disabled="live || busy" aria-label="Use microphone" />
                  <USelect v-if="s.micOn.value" v-model="s.micId.value" :items="micItems" size="sm" class="w-48" :disabled="live || busy" />
                  <div v-if="s.micOn.value && capturing" class="h-1.5 w-16 overflow-hidden rounded-full bg-accented" aria-hidden="true">
                    <div class="h-full rounded-full bg-success transition-[width] duration-75" :style="{ width: `${Math.round(s.micLevel.value * 100)}%` }" />
                  </div>
                </div>
              </div>
              <UButton
                v-if="capturing && !live && !busy"
                label="Apply changes"
                icon="i-lucide-refresh-cw"
                variant="outline"
                color="neutral"
                class="ml-auto self-end"
                @click="s.startPreview()"
              />
            </div>
          </UiPanel>
          <p class="text-xs text-dimmed">
            Tip: when sharing a browser tab, tick “Share tab audio” to include its sound. LiveLoom converts browser video to H.264 with 2 s keyframes for every platform.
          </p>
        </div>

        <!-- Destinations -->
        <aside class="space-y-4">
          <UiPanel title="Sending to" flush>
            <UEmpty
              v-if="!dash.destinations.value.length"
              icon="i-lucide-radio-tower"
              title="No destinations"
              description="Add one so your stream goes somewhere."
              :actions="[{ label: 'Add destination', to: '/destinations', variant: 'outline', color: 'neutral' }]"
              variant="naked"
              size="sm"
              class="py-6"
            />
            <ul v-else class="divide-y divide-default">
              <li v-for="d in dash.destinations.value" :key="d.id" class="flex items-center gap-2.5 px-4 py-2.5">
                <UiPlatformIcon :platform="d.platform" size="sm" />
                <span class="flex-1 truncate text-sm" :class="d.enabled ? 'text-highlighted' : 'text-dimmed'">{{ d.name }}</span>
                <UiStatus v-bind="destinationStatus(d.enabled, d.status.state, dash.isLive.value)" />
              </li>
            </ul>
          </UiPanel>
          <HealthPanel v-if="live && dash.health.value" compact />
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
