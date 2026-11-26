import type { ChatMessage } from '@sp/shared'

/**
 * Browser Studio: a small live compositor.
 *
 *   screen ─┐                       ┌─► preview (the canvas itself, on the page)
 *   camera ─┼─► canvas (scene) ─────┼─► WHIP → LiveLoom → every platform
 *   chat   ─┘                       └─► optional local recording
 *   mic + tab audio ─► AudioContext mix (always present; silent if nothing)
 *
 * The canvas is the output, so sources can be added, removed, moved and
 * zoomed while live without restarting the stream.
 *
 * Reliability:
 *   - the WHIP session reconnects automatically (backoff 1→10 s) on network
 *     failure, or if no video leaves the browser for 8 s;
 *   - frames are driven by a Worker timer so a background tab keeps streaming;
 *   - there is always an audio track (platforms dislike silent-less streams);
 *   - screen wake lock while live, and a warning before closing the tab.
 */
export type StudioState = 'idle' | 'connecting' | 'live' | 'reconnecting'
export type Quality = '720p' | '1080p'

const QUALITY: Record<Quality, { width: number, height: number, bitrate: number }> = {
  '720p': { width: 1280, height: 720, bitrate: 4_500_000 },
  '1080p': { width: 1920, height: 1080, bitrate: 8_000_000 },
}
const FPS = 30

export function useStudio(messages: Ref<ChatMessage[]>) {
  const scene = reactive<Scene>(import.meta.client ? loadScene() : structuredClone(DEFAULT_SCENE))
  watch(scene, (s) => saveScene(s), { deep: true })

  const quality = ref<Quality>('1080p')
  const state = ref<StudioState>('idle')
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const kbps = ref<number | null>(null)
  const startedAt = ref<number | null>(null)
  const micLevel = ref(0)
  const devices = ref<{ mics: MediaDeviceInfo[], cams: MediaDeviceInfo[] }>({ mics: [], cams: [] })
  const camId = ref('default')
  const micId = ref('default')
  const has = reactive({ screen: false, camera: false, mic: false, screenAudio: false })
  const recording = ref(false)
  /** Zoom on the screen layer: level 1–3 around a point (0–1 of the screen). */
  const zoom = reactive({ level: 1, x: 0.5, y: 0.5 })
  /** Where the screen was last drawn (canvas fractions), for click-to-zoom. */
  const screenRect = shallowRef<Rect | null>(null)

  const canvas = import.meta.client ? document.createElement('canvas') : (null as unknown as HTMLCanvasElement)
  let ctx: CanvasRenderingContext2D | null = null
  let ticker: Worker | null = null
  let canvasTrack: MediaStreamTrack | null = null

  let screen: MediaStream | null = null
  let camera: MediaStream | null = null
  let mic: MediaStream | null = null
  let screenVideo: HTMLVideoElement | null = null
  let cameraVideo: HTMLVideoElement | null = null

  let audioCtx: AudioContext | null = null
  let audioDest: MediaStreamAudioDestinationNode | null = null
  let micNode: MediaStreamAudioSourceNode | null = null
  let screenNode: MediaStreamAudioSourceNode | null = null
  let analyser: AnalyserNode | null = null

  let pc: RTCPeerConnection | null = null
  let sessionUrl: string | null = null
  let whipUrl = ''
  let wantLive = false
  let attempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let statsTimer: ReturnType<typeof setInterval> | undefined
  let wakeLock: WakeLockSentinel | null = null
  let recorder: MediaRecorder | null = null

  const pick = (id: string) => (id && id !== 'default' ? { exact: id } : undefined)

  /* ── Canvas / drawing ────────────────────────────────────────────────── */

  function sizeCanvas() {
    const q = QUALITY[quality.value]
    if (canvas.width !== q.width || canvas.height !== q.height) {
      canvas.width = q.width
      canvas.height = q.height
    }
  }

  // Smoothed zoom (eases toward the target every frame).
  const zcur = { level: 1, x: 0.5, y: 0.5 }

  function draw() {
    if (!ctx) return
    const W = canvas.width
    const H = canvas.height
    const now = Date.now()
    fillBackground(ctx, W, H, scene.background)

    const sv = screenVideo?.videoWidth ? screenVideo : null
    const cv = cameraVideo?.videoWidth ? cameraVideo : null
    const main = sv ?? cv
    const framed = scene.background !== 'none'

    if (main) {
      const p = framed ? scene.padding * H : 0
      const box = { x: p, y: p, w: W - 2 * p, h: H - 2 * p }
      const r = contain(main.videoWidth, main.videoHeight, box)
      screenRect.value = { x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H }

      const k = 0.14
      zcur.level += (zoom.level - zcur.level) * k
      zcur.x += (zoom.x - zcur.x) * k
      zcur.y += (zoom.y - zcur.y) * k
      const vw = main.videoWidth
      const vh = main.videoHeight
      const cw = vw / zcur.level
      const ch = vh / zcur.level
      const sx = clamp(zcur.x * vw - cw / 2, 0, vw - cw)
      const sy = clamp(zcur.y * vh - ch / 2, 0, vh - ch)
      const radius = framed ? scene.radius * H : 0

      if (framed && scene.padding > 0) {
        ctx.save()
        ctx.shadowColor = 'rgba(0,0,0,0.45)'
        ctx.shadowBlur = H * 0.04
        ctx.shadowOffsetY = H * 0.012
        ctx.fillStyle = '#000'
        roundRect(ctx, r, radius)
        ctx.fill()
        ctx.restore()
      }
      ctx.save()
      if (radius > 0) {
        roundRect(ctx, r, radius)
        ctx.clip()
      }
      const mirrorMain = main === cv && scene.camera.mirror
      if (mirrorMain) {
        ctx.translate(r.x * 2 + r.w, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(main, sx, sy, cw, ch, r.x, r.y, r.w, r.h)
      ctx.restore()
    } else {
      screenRect.value = null
    }

    // Camera bubble (only when the screen is the main layer).
    if (sv && cv) {
      const c = scene.camera
      const size = c.size * H
      const x = clamp(c.x * W - size / 2, 0, W - size)
      const y = clamp(c.y * H - size / 2, 0, H - size)
      const rect = { x, y, w: size, h: size }
      const radius = c.shape === 'circle' ? size / 2 : c.shape === 'rounded' ? size * 0.18 : 0
      const side = Math.min(cv.videoWidth, cv.videoHeight)
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.4)'
      ctx.shadowBlur = H * 0.02
      ctx.shadowOffsetY = H * 0.006
      ctx.fillStyle = '#111'
      roundRect(ctx, rect, radius)
      ctx.fill()
      ctx.restore()
      ctx.save()
      roundRect(ctx, rect, radius)
      ctx.clip()
      if (c.mirror) {
        ctx.translate(x * 2 + size, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(cv, (cv.videoWidth - side) / 2, (cv.videoHeight - side) / 2, side, side, x, y, size, size)
      ctx.restore()
      if (c.border) {
        ctx.lineWidth = Math.max(2, H / 300)
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        roundRect(ctx, { x: x + ctx.lineWidth / 2, y: y + ctx.lineWidth / 2, w: size - ctx.lineWidth, h: size - ctx.lineWidth }, Math.max(0, radius - ctx.lineWidth / 2))
        ctx.stroke()
      }
    }

    if (scene.chat.on) drawChat(ctx, W, H, scene.chat, messages.value, now)
  }

  function startLoop() {
    if (ticker || !import.meta.client) return
    sizeCanvas()
    ctx = canvas.getContext('2d', { alpha: false })
    // A Worker timer keeps firing in background tabs (rAF and setInterval get throttled).
    const src = 'let t;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}'
    ticker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
    ticker.onmessage = () => {
      try { draw() } catch (e) { console.warn('[studio] draw', e) }
    }
    ticker.postMessage(1000 / FPS)
    canvasTrack = canvas.captureStream(FPS).getVideoTracks()[0]!
    canvasTrack.contentHint = 'detail'
  }

  watch(quality, () => sizeCanvas())

  /* ── Sources ─────────────────────────────────────────────────────────── */

  function videoEl(stream: MediaStream) {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.srcObject = stream
    void v.play().catch(() => {})
    return v
  }
  const stopStream = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop())

  async function loadDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      devices.value = {
        mics: list.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default'),
        cams: list.filter((d) => d.kind === 'videoinput' && d.deviceId && d.deviceId !== 'default'),
      }
    } catch {}
  }

  function ensureAudio() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') void audioCtx.resume()
      return
    }
    audioCtx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
    audioDest = audioCtx.createMediaStreamDestination()
    // A silent constant source keeps the audio track producing samples even with nothing connected.
    const silence = audioCtx.createConstantSource()
    silence.offset.value = 0
    silence.connect(audioDest)
    silence.start()
  }

  function permissionMessage(e: any, what: string) {
    if (e?.name === 'NotAllowedError') return `${what}: permission denied. Allow access in the browser’s address bar and try again.`
    if (e?.name === 'NotFoundError') return `${what}: no device found.`
    if (e?.name === 'NotReadableError') return `${what} is in use by another app. Close it and try again.`
    return `${what}: ${e?.message ?? 'could not start'}`
  }

  async function toggleScreen(on = !has.screen) {
    error.value = null
    startLoop()
    ensureAudio()
    if (!on) {
      screenNode?.disconnect()
      screenNode = null
      stopStream(screen)
      screen = null
      screenVideo = null
      has.screen = has.screenAudio = false
      zoom.level = 1
      return
    }
    try {
      const q = QUALITY[quality.value]
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: FPS, max: FPS } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        // Chrome: offer "this tab" last, and let people switch what they share mid-stream.
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        systemAudio: 'include',
      } as DisplayMediaStreamOptions)
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError') error.value = permissionMessage(e, 'Screen sharing')
      return
    }
    const track = screen.getVideoTracks()[0]!
    track.contentHint = 'detail'
    track.addEventListener('ended', () => { if (screen?.getVideoTracks()[0] === track) void toggleScreen(false) })
    screenVideo = videoEl(screen)
    has.screen = true
    if (screen.getAudioTracks().length && audioCtx && audioDest) {
      screenNode = audioCtx.createMediaStreamSource(screen)
      screenNode.connect(audioDest)
      has.screenAudio = true
    }
  }

  async function toggleCamera(on = !has.camera) {
    error.value = null
    startLoop()
    stopStream(camera)
    camera = null
    cameraVideo = null
    has.camera = false
    if (!on) return
    try {
      camera = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: pick(camId.value), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: FPS } },
      })
    } catch (e) {
      error.value = permissionMessage(e, 'Camera')
      return
    }
    camera.getVideoTracks()[0]!.addEventListener('ended', () => { if (has.camera) void toggleCamera(false) })
    cameraVideo = videoEl(camera)
    has.camera = true
    void loadDevices()
  }

  let levelTimer: ReturnType<typeof setInterval> | undefined
  async function toggleMic(on = !has.mic) {
    error.value = null
    ensureAudio()
    micNode?.disconnect()
    micNode = null
    stopStream(mic)
    mic = null
    has.mic = false
    clearInterval(levelTimer)
    micLevel.value = 0
    if (!on) return
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: pick(micId.value), echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      })
    } catch (e) {
      error.value = permissionMessage(e, 'Microphone')
      return
    }
    micNode = audioCtx!.createMediaStreamSource(mic)
    micNode.connect(audioDest!)
    analyser = audioCtx!.createAnalyser()
    analyser.fftSize = 512
    micNode.connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    levelTimer = setInterval(() => {
      analyser?.getByteTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
      micLevel.value = Math.min(1, peak / 100)
    }, 80)
    has.mic = true
    void loadDevices()
  }

  watch(camId, () => { if (has.camera) void toggleCamera(true) })
  watch(micId, () => { if (has.mic) void toggleMic(true) })

  /** Zoom toggle at a point on the canvas (fractions). */
  function zoomAt(cx: number, cy: number, level?: number) {
    const r = screenRect.value
    if (!r) return
    const next = level ?? (zoom.level > 1.05 ? 1 : 2)
    if (next > 1) {
      // Point on the visible (possibly already zoomed) image → source coordinates.
      const u = clamp((cx - r.x) / r.w, 0, 1)
      const v = clamp((cy - r.y) / r.h, 0, 1)
      const vis = 1 / zcur.level
      const left = clamp(zcur.x - vis / 2, 0, 1 - vis)
      const top = clamp(zcur.y - vis / 2, 0, 1 - vis)
      zoom.x = left + u * vis
      zoom.y = top + v * vis
    }
    zoom.level = next
  }

  /* ── Going live (WHIP) ───────────────────────────────────────────────── */

  function outputStream() {
    startLoop()
    ensureAudio()
    return new MediaStream([canvasTrack!, audioDest!.stream.getAudioTracks()[0]!])
  }

  async function connect() {
    const q = QUALITY[quality.value]
    const out = outputStream()
    const [video] = out.getVideoTracks()
    const [audio] = out.getAudioTracks()
    const peer = new RTCPeerConnection({ bundlePolicy: 'max-bundle' })
    pc = peer
    const vt = peer.addTransceiver(video!, { direction: 'sendonly', sendEncodings: [{ maxBitrate: q.bitrate, maxFramerate: FPS }] })
    const caps = RTCRtpSender.getCapabilities?.('video')?.codecs ?? []
    const h264 = caps.filter((c) => /h264/i.test(c.mimeType))
    if (h264.length && vt.setCodecPreferences) vt.setCodecPreferences([...h264, ...caps.filter((c) => !/h264/i.test(c.mimeType))])
    peer.addTransceiver(audio!, { direction: 'sendonly', sendEncodings: [{ maxBitrate: 160_000 }] })

    let disconnectTimer: ReturnType<typeof setTimeout> | undefined
    peer.addEventListener('connectionstatechange', () => {
      if (pc !== peer) return
      const s = peer.connectionState
      clearTimeout(disconnectTimer)
      if (s === 'connected') {
        state.value = 'live'
        notice.value = null
        attempt = 0
        startedAt.value ??= Date.now()
        // Keep sharp text: lower the frame rate before the resolution on a weak network.
        const params = vt.sender.getParameters()
        params.degradationPreference = 'maintain-resolution'
        vt.sender.setParameters(params).catch(() => {})
      } else if (s === 'disconnected') {
        disconnectTimer = setTimeout(() => reconnect('Connection dropped'), 5000)
      } else if (s === 'failed') {
        reconnect('Connection failed')
      }
    })

    await peer.setLocalDescription(await peer.createOffer())
    await new Promise<void>((resolve) => {
      if (peer.iceGatheringState === 'complete') return resolve()
      const t = setTimeout(resolve, 2000)
      peer.addEventListener('icegatheringstatechange', () => {
        if (peer.iceGatheringState === 'complete') { clearTimeout(t); resolve() }
      })
    })
    if (pc !== peer) return

    const res = await fetch(whipUrl, { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: peer.localDescription!.sdp })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const err = new Error(res.status === 401 || res.status === 403 ? 'LiveLoom rejected your stream key. Reload the page and try again.' : `LiveLoom refused the stream (${res.status}) ${body.slice(0, 120)}`)
      ;(err as any).fatal = res.status === 401 || res.status === 403
      throw err
    }
    const loc = res.headers.get('location')
    sessionUrl = loc ? new URL(loc.startsWith('/') && !loc.startsWith('/whip') ? `/whip${loc}` : loc, whipUrl).toString() : null
    await peer.setRemoteDescription({ type: 'answer', sdp: await res.text() })
  }

  function teardownPeer() {
    if (sessionUrl) fetch(sessionUrl, { method: 'DELETE', keepalive: true }).catch(() => {})
    sessionUrl = null
    const p = pc
    pc = null
    p?.close()
  }

  function reconnect(reason: string) {
    if (!wantLive) return
    teardownPeer()
    clearTimeout(retryTimer)
    state.value = 'reconnecting'
    const delay = Math.min(10_000, 1000 * 2 ** attempt)
    attempt++
    notice.value = `${reason}. Reconnecting in ${Math.round(delay / 1000)}s…`
    retryTimer = setTimeout(() => void connectWithRetry(), delay)
  }

  async function connectWithRetry() {
    if (!wantLive) return
    try {
      await connect()
    } catch (e: any) {
      if (e?.fatal) {
        error.value = e.message
        await stop()
        return
      }
      reconnect(e?.message?.startsWith('LiveLoom') ? e.message : 'Can’t reach LiveLoom')
    }
  }

  function startStats() {
    let last = { bytes: 0, video: 0, t: 0, stalledSince: 0 }
    statsTimer = setInterval(async () => {
      if (!pc || state.value !== 'live') { last.stalledSince = 0; return }
      const stats = await pc.getStats()
      let bytes = 0
      let video = 0
      stats.forEach((r: any) => {
        if (r.type === 'outbound-rtp') {
          bytes += r.bytesSent ?? 0
          if (r.kind === 'video') video += r.bytesSent ?? 0
        }
      })
      const now = performance.now()
      if (last.t) kbps.value = Math.round(((bytes - last.bytes) * 8) / (now - last.t))
      // Watchdog: connected but no video leaving the browser → start over.
      if (video <= last.video) {
        last.stalledSince ||= now
        if (now - last.stalledSince > 8000) {
          last.stalledSince = 0
          reconnect('No video was being sent')
        }
      } else {
        last.stalledSince = 0
      }
      last = { ...last, bytes, video, t: now }
    }, 1000)
  }

  const beforeUnload = (e: BeforeUnloadEvent) => { if (wantLive) e.preventDefault() }

  async function goLive(url: string) {
    if (wantLive) return
    error.value = null
    notice.value = null
    whipUrl = url
    wantLive = true
    attempt = 0
    state.value = 'connecting'
    startStats()
    window.addEventListener('beforeunload', beforeUnload)
    try { wakeLock = await (navigator as any).wakeLock?.request('screen') } catch {}
    await connectWithRetry()
  }

  async function stop() {
    wantLive = false
    clearTimeout(retryTimer)
    clearInterval(statsTimer)
    teardownPeer()
    kbps.value = null
    startedAt.value = null
    notice.value = null
    state.value = 'idle'
    window.removeEventListener('beforeunload', beforeUnload)
    wakeLock?.release().catch(() => {})
    wakeLock = null
  }

  /* ── Local recording ─────────────────────────────────────────────────── */

  async function startRecording() {
    if (recording.value) return
    const types = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
    const name = `LiveLoom ${new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-')}.${ext}`
    // Write straight to disk when the browser allows it (no memory limit on long streams).
    let writable: any = null
    try {
      const handle = await (window as any).showSaveFilePicker?.({ suggestedName: name })
      writable = await handle?.createWritable()
    } catch (e: any) {
      if (e?.name === 'AbortError') return
    }
    const chunks: Blob[] = []
    recorder = new MediaRecorder(outputStream(), { mimeType: mimeType || undefined, videoBitsPerSecond: QUALITY[quality.value].bitrate, audioBitsPerSecond: 192_000 })
    let writing = Promise.resolve()
    recorder.ondataavailable = (e) => {
      if (!e.data.size) return
      if (writable) writing = writing.then(() => writable.write(e.data))
      else chunks.push(e.data)
    }
    recorder.onstop = async () => {
      await writing
      if (writable) {
        await writable.close()
      } else {
        const url = URL.createObjectURL(new Blob(chunks, { type: mimeType || 'video/webm' }))
        const a = Object.assign(document.createElement('a'), { href: url, download: name })
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
      recording.value = false
    }
    recorder.start(1000)
    recording.value = true
  }

  function stopRecording() {
    recorder?.stop()
    recorder = null
  }

  /* ── Lifecycle ───────────────────────────────────────────────────────── */

  function release() {
    void stop()
    if (recording.value) stopRecording()
    ticker?.terminate()
    ticker = null
    clearInterval(levelTimer)
    for (const s of [screen, camera, mic]) stopStream(s)
    screen = camera = mic = null
    screenVideo = cameraVideo = null
    canvasTrack?.stop()
    audioCtx?.close().catch(() => {})
    audioCtx = null
  }

  onMounted(() => {
    void loadDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices)
  })
  onBeforeUnmount(() => {
    navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices)
    release()
  })

  return {
    canvas, scene, quality, state, error, notice, kbps, startedAt, micLevel, devices, camId, micId, has, zoom, screenRect, recording,
    startLoop, toggleScreen, toggleCamera, toggleMic, zoomAt, goLive, stop, startRecording, stopRecording,
  }
}
