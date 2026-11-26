<script setup lang="ts">
import type { Quality } from '~/composables/useStudio'

const dash = useDashboard()
const origin = useSiteOrigin()
const { data: channel } = useChannel()
const { data: chatConfig } = useChatConfig()
const s = useStudio()

const stage = ref<HTMLDivElement>()
onMounted(() => {
  s.startLoop()
  s.canvas.className = 'absolute inset-0 size-full'
  stage.value?.prepend(s.canvas)
})
onBeforeUnmount(() => {
  s.canvas.remove()
  // Keep streaming/recording while you use other pages; otherwise free the camera and mic.
  if (s.state.value === 'idle' && !s.recording.value) s.release()
})

const live = computed(() => s.state.value === 'live' || s.state.value === 'reconnecting')
const busy = computed(() => s.state.value === 'connecting')
const onAir = computed(() => live.value || busy.value)
const anySource = computed(() => s.has.screen || s.has.camera)
const otherLive = computed(() => dash.isLive.value && !onAir.value)
const bubble = computed(() => s.has.screen && s.has.camera)
const uptime = computed(() => (s.startedAt.value ? formatDuration(dash.now.value - s.startedAt.value) : null))
// Only warn about a quality limit that lasts (a few seconds of ramp-up is normal).
const limitedFor = ref(0)
watch(() => s.sendInfo.value, (i) => { limitedFor.value = i && i.limit !== 'none' && i.limit !== 'other' ? limitedFor.value + 1 : 0 })
const supported = ref(true)
onMounted(() => { supported.value = !!navigator.mediaDevices?.getDisplayMedia && 'RTCPeerConnection' in window })

async function goLive() {
  if (otherLive.value && !confirm('You’re already live from OBS (or another tab). Going live here replaces that stream. Continue?')) return
  await s.goLive(`${origin.value}/whip/live/${channel.value?.ingestKey}/whip`)
}

const qualities: { label: string, value: Quality }[] = [
  { label: '1080p · best', value: '1080p' },
  { label: '720p · slower internet', value: '720p' },
]
const camItems = computed(() => [{ label: 'Default camera', value: 'default' }, ...s.devices.value.cams.map((d) => ({ label: d.label || 'Camera', value: d.deviceId }))])
const micItems = computed(() => [{ label: 'Default microphone', value: 'default' }, ...s.devices.value.mics.map((d) => ({ label: d.label || 'Microphone', value: d.deviceId }))])

/* ── Direct manipulation on the preview ─────────────────────────────── */
type Drag = { kind: 'cam-move' | 'cam-size' | 'chat-move' | 'chat-size', x0: number, y0: number, start: any }
let drag: Drag | null = null
const dragging = ref(false)
function begin(kind: Drag['kind'], e: PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  drag = { kind, x0: e.clientX, y0: e.clientY, start: kind.startsWith('cam') ? { ...s.scene.camera } : { ...s.scene.chat } }
  dragging.value = true
}
function move(e: PointerEvent) {
  if (!drag || !stage.value) return
  const r = stage.value.getBoundingClientRect()
  const dx = (e.clientX - drag.x0) / r.width
  const dy = (e.clientY - drag.y0) / r.height
  const st = drag.start
  const aspect = r.width / r.height
  if (drag.kind === 'cam-move') {
    const half = st.size / 2
    s.scene.camera.x = clamp(st.x + dx, half / aspect, 1 - half / aspect)
    s.scene.camera.y = clamp(st.y + dy, half, 1 - half)
  } else if (drag.kind === 'cam-size') {
    s.scene.camera.size = clamp(st.size + Math.max(dx * aspect, dy) * 2, 0.12, 0.8)
  } else if (drag.kind === 'chat-move') {
    s.scene.chat.x = clamp(st.x + dx, 0, 1 - st.w)
    s.scene.chat.y = clamp(st.y + dy, 0, 1 - st.h)
  } else {
    s.scene.chat.w = clamp(st.w + dx, 0.12, 1 - st.x)
    s.scene.chat.h = clamp(st.h + dy, 0.12, 1 - st.y)
  }
}
function end() { drag = null; dragging.value = false }

const camBox = computed(() => {
  const c = s.scene.camera
  const aspect = 16 / 9
  const w = c.size / aspect
  return { left: `${(c.x - w / 2) * 100}%`, top: `${(c.y - c.size / 2) * 100}%`, width: `${w * 100}%`, height: `${c.size * 100}%`, borderRadius: c.shape === 'circle' ? '9999px' : c.shape === 'rounded' ? '18%' : '0' }
})
const chatBox = computed(() => {
  const c = s.scene.chat
  return { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }
})
function onStageDblClick(e: MouseEvent) {
  if (!stage.value || !s.has.screen) return
  const r = stage.value.getBoundingClientRect()
  s.zoomAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
}

const shapes = [
  { value: 'circle', icon: 'i-lucide-circle', label: 'Circle' },
  { value: 'rounded', icon: 'i-lucide-squircle', label: 'Rounded' },
  { value: 'square', icon: 'i-lucide-square', label: 'Square' },
] as const

defineShortcuts({
  z: () => { if (s.has.screen) s.zoomAt(0.5, 0.5, s.zoom.level > 1.05 ? 1 : 2) },
  escape: () => { if (s.zoom.level > 1) s.zoom.level = 1 },
})
</script>

<template>
  <UDashboardPanel id="studio" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <UDashboardNavbar title="Go live from browser">
        <template #trailing>
          <UBadge label="Beta" variant="soft" color="neutral" />
        </template>
        <template #right>
          <UTooltip v-if="live" text="What your browser is sending to LiveLoom right now">
            <span class="hidden items-center gap-3 font-mono text-xs tabular-nums text-muted sm:flex">
              <span>{{ uptime }}</span>
              <span v-if="s.sendInfo.value?.height">{{ s.sendInfo.value.width }}×{{ s.sendInfo.value.height }} · {{ s.sendInfo.value.fps }}fps · {{ s.sendInfo.value.codec.toUpperCase() }}</span>
              <span>{{ formatKbps(s.kbps.value) }}</span>
            </span>
          </UTooltip>
          <UTooltip :text="s.recording.value ? 'Stop recording and save the file' : 'Save a copy of the stream on this computer'">
            <UButton
              :label="s.recording.value ? 'Stop recording' : 'Record'"
              :icon="s.recording.value ? 'i-lucide-square' : 'i-lucide-circle-dot'"
              variant="ghost"
              :color="s.recording.value ? 'error' : 'neutral'"
              :disabled="!anySource && !s.recording.value"
              @click="s.recording.value ? s.stopRecording() : s.startRecording()"
            />
          </UTooltip>
          <UButton v-if="onAir" label="End stream" icon="i-lucide-square" color="error" variant="soft" @click="s.stop()" />
          <UButton v-else label="Go live" icon="i-lucide-radio" :disabled="!anySource || !supported" @click="goLive" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid min-h-full lg:grid-cols-[1fr_19rem]">
        <!-- Stage -->
        <div class="min-w-0 space-y-3 p-4 sm:p-6">
          <UiCallout v-if="!supported" tone="error" title="This browser can’t stream" description="Use a recent Chrome, Edge, Firefox or Safari on a computer." />
          <UiCallout v-if="s.error.value" tone="error" :title="s.error.value">
            <template #actions><UButton icon="i-lucide-x" size="xs" variant="ghost" color="neutral" aria-label="Dismiss" @click="s.error.value = null" /></template>
          </UiCallout>
          <UiCallout v-if="s.notice.value" tone="warning" :title="s.notice.value" description="Your preview keeps running. Platforms reconnect on their own once LiveLoom is back." />
          <UiCallout
            v-if="limitedFor >= 8 && s.sendInfo.value?.limit === 'bandwidth'"
            tone="warning"
            title="Your internet upload is limiting the picture"
            description="The browser lowered quality to keep the stream smooth. Use a wired connection, pause big uploads or downloads, or switch Quality to 720p."
          />
          <UiCallout
            v-if="limitedFor >= 8 && s.sendInfo.value?.limit === 'cpu'"
            tone="warning"
            title="Your computer is struggling to encode"
            description="Close heavy apps and tabs, or switch Quality to 720p. On a laptop, plug in the charger."
          />
          <UiCallout v-if="otherLive" tone="warning" title="You’re already live from OBS" description="Going live here replaces the OBS stream on every destination." />

          <div
            ref="stage"
            class="relative aspect-video select-none overflow-hidden rounded-[10px] bg-black ring-1 ring-(--ui-border-muted)"
            :class="dragging && 'cursor-grabbing'"
            @pointermove="move"
            @pointerup="end"
            @pointercancel="end"
            @dblclick="onStageDblClick"
          >
            <!-- Drag handles drawn over the canvas -->
            <div
              v-if="bubble"
              class="group absolute cursor-grab outline-1 outline-transparent transition-[outline-color] hover:outline-(--ui-primary)"
              :style="camBox"
              @pointerdown="begin('cam-move', $event)"
              @dblclick.stop
            >
              <span
                class="absolute -bottom-1 -right-1 size-3.5 cursor-nwse-resize rounded-full border-2 border-white bg-primary opacity-0 shadow group-hover:opacity-100"
                @pointerdown="begin('cam-size', $event)"
              />
            </div>
            <div
              v-if="s.scene.chat.on"
              class="group absolute cursor-grab rounded-md outline-1 outline-dashed outline-transparent transition-[outline-color] hover:outline-white/50"
              :style="chatBox"
              @pointerdown="begin('chat-move', $event)"
              @dblclick.stop
            >
              <span class="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-2xs text-white/80 opacity-0 group-hover:opacity-100">Chat · drag to move</span>
              <span
                class="absolute -bottom-1 -right-1 size-3.5 cursor-nwse-resize rounded-full border-2 border-white bg-primary opacity-0 shadow group-hover:opacity-100"
                @pointerdown="begin('chat-size', $event)"
              />
            </div>

            <!-- Empty state -->
            <div v-if="!anySource" class="absolute inset-0 grid place-items-center">
              <div class="flex flex-col items-center gap-3 text-center">
                <p class="text-sm text-white/70">Add what you want to show</p>
                <div class="flex gap-2">
                  <UButton label="Share screen" icon="i-lucide-monitor" :disabled="!supported" @click="s.toggleScreen(true)" />
                  <UButton label="Camera" icon="i-lucide-video" color="neutral" variant="outline" :disabled="!supported" @click="s.toggleCamera(true)" />
                </div>
              </div>
            </div>

            <div v-if="live || busy" class="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-md bg-black/70 px-2 py-1 backdrop-blur">
              <UiStatus :tone="s.state.value === 'live' ? 'live' : s.state.value === 'reconnecting' ? 'warning' : 'info'" :label="s.state.value === 'live' ? 'LIVE' : s.state.value === 'reconnecting' ? 'Reconnecting' : 'Connecting'" />
              <span v-if="uptime" class="font-mono text-xs tabular-nums text-white/80">{{ uptime }}</span>
            </div>
            <div v-if="s.recording.value" class="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white backdrop-blur">
              <span class="size-2 animate-pulse rounded-full bg-error" />REC
            </div>
            <div v-if="s.zoom.level > 1" class="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md bg-black/70 p-0.5 backdrop-blur">
              <span class="px-2 text-xs text-white/80">{{ s.zoom.level }}×</span>
              <UButton label="Reset zoom" size="xs" color="neutral" variant="ghost" class="text-white hover:bg-white/10" @click="s.zoom.level = 1" />
            </div>
          </div>

          <!-- Source bar -->
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              :label="s.has.screen ? 'Stop sharing' : 'Share screen'"
              icon="i-lucide-monitor"
              :color="s.has.screen ? 'primary' : 'neutral'"
              :variant="s.has.screen ? 'soft' : 'outline'"
              :disabled="!supported"
              @click="s.toggleScreen()"
            />
            <UFieldGroup>
              <UButton
                :label="s.has.camera ? 'Camera on' : 'Camera'"
                :icon="s.has.camera ? 'i-lucide-video' : 'i-lucide-video-off'"
                :color="s.has.camera ? 'primary' : 'neutral'"
                :variant="s.has.camera ? 'soft' : 'outline'"
                @click="s.toggleCamera()"
              />
              <USelect v-if="s.devices.value.cams.length > 1" v-model="s.camId.value" :items="camItems" size="sm" class="w-36" aria-label="Camera device" />
            </UFieldGroup>
            <UFieldGroup>
              <UButton
                :label="s.has.mic ? 'Mic on' : 'Mic'"
                :icon="s.has.mic ? 'i-lucide-mic' : 'i-lucide-mic-off'"
                :color="s.has.mic ? 'primary' : 'neutral'"
                :variant="s.has.mic ? 'soft' : 'outline'"
                @click="s.toggleMic()"
              />
              <USelect v-if="s.devices.value.mics.length > 1" v-model="s.micId.value" :items="micItems" size="sm" class="w-36" aria-label="Microphone device" />
            </UFieldGroup>
            <div v-if="s.has.mic" class="h-1.5 w-16 overflow-hidden rounded-full bg-accented" aria-hidden="true">
              <div class="h-full rounded-full bg-success transition-[width] duration-75" :style="{ width: `${Math.round(s.micLevel.value * 100)}%` }" />
            </div>
            <span v-if="s.has.screenAudio" class="flex items-center gap-1 text-xs text-muted"><UIcon name="i-lucide-volume-2" class="size-3.5" />Screen audio</span>
          </div>
          <p class="text-xs text-dimmed">
            Drag the camera or chat on the preview to move them, and drag the dot to resize. Double-click the screen (or press <UKbd value="Z" />) to zoom in.
            Sharing a tab? Tick “Share tab audio” to include its sound.
          </p>
        </div>

        <!-- Inspector -->
        <aside class="space-y-6 border-muted p-4 sm:p-6 lg:border-l lg:px-5">
          <section class="space-y-2">
            <h3 class="label-caps">Sending to</h3>
            <UEmpty
              v-if="!dash.destinations.value.length"
              icon="i-lucide-radio-tower"
              title="No destinations"
              description="Add one so your stream goes somewhere."
              :actions="[{ label: 'Add destination', onClick: () => useDestinationDialog().add() }]"
              variant="naked"
              size="sm"
            />
            <ul v-else class="space-y-0.5">
              <li v-for="d in dash.destinations.value" :key="d.id" class="flex items-center gap-2 py-1">
                <UiPlatformIcon :platform="d.platform" size="sm" />
                <span class="flex-1 truncate text-sm" :class="d.enabled ? 'text-highlighted' : 'text-dimmed'">{{ d.name }}</span>
                <UTooltip :text="d.status.message ?? ''" :disabled="!d.status.message">
                  <UiStatus v-bind="destinationStatus(d.enabled, d.status.state, dash.isLive.value)" />
                </UTooltip>
              </li>
            </ul>
          </section>

          <section v-if="bubble" class="space-y-3">
            <h3 class="label-caps">Camera</h3>
            <div class="flex items-center gap-2">
              <UFieldGroup>
                <UTooltip v-for="sh in shapes" :key="sh.value" :text="sh.label">
                  <UButton :icon="sh.icon" :aria-label="sh.label" color="neutral" :variant="s.scene.camera.shape === sh.value ? 'soft' : 'outline'" @click="s.scene.camera.shape = sh.value" />
                </UTooltip>
              </UFieldGroup>
              <UFieldGroup>
                <UTooltip v-for="p in CAMERA_PRESETS" :key="p.id" :text="p.label">
                  <UButton
                    :aria-label="p.label"
                    color="neutral"
                    variant="outline"
                    :icon="{ br: 'i-lucide-arrow-down-right', bl: 'i-lucide-arrow-down-left', tr: 'i-lucide-arrow-up-right', tl: 'i-lucide-arrow-up-left' }[p.id]"
                    @click="Object.assign(s.scene.camera, { x: p.x, y: p.y })"
                  />
                </UTooltip>
              </UFieldGroup>
            </div>
            <div class="flex items-center gap-3">
              <span class="w-14 text-sm text-muted">Size</span>
              <USlider v-model="s.scene.camera.size" :min="0.12" :max="0.8" :step="0.01" size="sm" />
            </div>
            <div class="flex flex-wrap gap-x-4 gap-y-2">
              <USwitch v-model="s.scene.camera.mirror" label="Mirror" />
              <USwitch v-model="s.scene.camera.border" label="Border" />
            </div>
          </section>
          <section v-else-if="s.has.camera" class="space-y-2">
            <h3 class="label-caps">Camera</h3>
            <USwitch v-model="s.scene.camera.mirror" label="Mirror" />
            <p class="text-xs text-dimmed">Share your screen too and the camera becomes a bubble you can move.</p>
          </section>

          <section class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="label-caps">Chat on stream</h3>
              <USwitch v-model="s.scene.chat.on" aria-label="Show chat on stream" />
            </div>
            <template v-if="s.scene.chat.on">
              <div class="flex items-center gap-3">
                <span class="w-14 text-sm text-muted">Text</span>
                <USlider v-model="s.scene.chat.scale" :min="0.6" :max="2" :step="0.05" size="sm" />
              </div>
              <div class="flex items-center gap-3">
                <span class="w-14 text-sm text-muted">Backdrop</span>
                <USlider v-model="s.scene.chat.opacity" :min="0" :max="0.9" :step="0.05" size="sm" />
              </div>
              <div class="flex items-center gap-3">
                <span class="w-14 text-sm text-muted">Hide after</span>
                <USelect
                  v-model="s.scene.chat.fadeAfter"
                  :items="[{ label: 'Never', value: 0 }, { label: '30 seconds', value: 30 }, { label: '1 minute', value: 60 }, { label: '2 minutes', value: 120 }]"
                  size="sm"
                  class="flex-1"
                />
              </div>
              <p v-if="!chatConfig?.twitch && !chatConfig?.kick && !chatConfig?.youtube" class="text-xs text-dimmed">
                No chat channels yet. <ULink to="/chat" class="text-highlighted underline">Add them on the Chat page</ULink>.
              </p>
            </template>
          </section>

          <section class="space-y-3">
            <h3 class="label-caps">Background</h3>
            <div class="grid grid-cols-6 gap-1.5">
              <UTooltip v-for="b in BACKGROUNDS" :key="b.id" :text="b.label">
                <button
                  type="button"
                  class="aspect-square rounded-md ring-offset-2 ring-offset-(--ui-bg) transition-shadow"
                  :class="s.scene.background === b.id ? 'ring-2 ring-primary' : 'ring-1 ring-(--ui-border)'"
                  :style="{ background: b.id === 'none' ? 'repeating-conic-gradient(var(--ui-bg-accented) 0 25%, transparent 0 50%) 0 0/8px 8px' : `linear-gradient(135deg, ${b.stops[0]}, ${b.stops[1]})` }"
                  :aria-label="b.label"
                  @click="s.scene.background = b.id; if (b.id !== 'none' && !s.scene.padding) { s.scene.padding = 0.05; s.scene.radius = 0.02 }"
                />
              </UTooltip>
            </div>
            <template v-if="s.scene.background !== 'none'">
              <div class="flex items-center gap-3">
                <span class="w-14 text-sm text-muted">Padding</span>
                <USlider v-model="s.scene.padding" :min="0" :max="0.15" :step="0.005" size="sm" />
              </div>
              <div class="flex items-center gap-3">
                <span class="w-14 text-sm text-muted">Corners</span>
                <USlider v-model="s.scene.radius" :min="0" :max="0.06" :step="0.002" size="sm" />
              </div>
            </template>
          </section>

          <section class="space-y-2">
            <h3 class="label-caps">Quality</h3>
            <USelect v-model="s.quality.value" :items="qualities" size="sm" class="w-full" :disabled="onAir || s.recording.value" />
            <p class="text-xs text-dimmed">LiveLoom sends every platform 1080p30 at 6 Mbps with 2 s keyframes, the most they all accept.</p>
          </section>

          <HealthPanel v-if="live && dash.health.value" compact />
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
