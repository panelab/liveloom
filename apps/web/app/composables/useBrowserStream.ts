/**
 * Browser streaming: capture screen/camera/mic, publish to MediaMTX over WHIP.
 * The relay normalizes WebRTC streams (H.264 + AAC, 2 s keyframes) before
 * sending them to every destination, so codecs here don't need to match RTMP.
 */
export type SourceMode = 'screen' | 'camera' | 'both'
export type StreamState = 'idle' | 'preview' | 'connecting' | 'live' | 'error'
export type Quality = '720p' | '1080p'

const QUALITY: Record<Quality, { width: number, height: number, bitrate: number }> = {
  '720p': { width: 1280, height: 720, bitrate: 3_500_000 },
  '1080p': { width: 1920, height: 1080, bitrate: 6_000_000 },
}

export function useBrowserStream() {
  const state = ref<StreamState>('idle')
  const error = ref<string | null>(null)
  const mode = ref<SourceMode>('screen')
  const quality = ref<Quality>('720p')
  const micOn = ref(true)
  /** 'default' = let the browser pick */
  const micId = ref('default')
  const camId = ref('default')
  const pick = (id: string) => (id && id !== 'default' ? { exact: id } : undefined)
  const devices = ref<{ mics: MediaDeviceInfo[], cams: MediaDeviceInfo[] }>({ mics: [], cams: [] })
  const kbps = ref<number | null>(null)
  const startedAt = ref<number | null>(null)
  const preview = shallowRef<MediaStream | null>(null)
  const micLevel = ref(0)

  let screen: MediaStream | null = null
  let camera: MediaStream | null = null
  let mic: MediaStream | null = null
  let audioCtx: AudioContext | null = null
  let mixedAudio: MediaStreamTrack | null = null
  let canvasStream: MediaStream | null = null
  let ticker: Worker | null = null
  let pc: RTCPeerConnection | null = null
  let sessionUrl: string | null = null
  let statsTimer: ReturnType<typeof setInterval> | undefined
  let levelTimer: ReturnType<typeof setInterval> | undefined

  async function loadDevices() {
    const list = await navigator.mediaDevices.enumerateDevices()
    devices.value = {
      mics: list.filter((d) => d.kind === 'audioinput' && d.deviceId),
      cams: list.filter((d) => d.kind === 'videoinput' && d.deviceId),
    }
  }

  function stopTracks(s: MediaStream | null) {
    s?.getTracks().forEach((t) => t.stop())
  }

  function releaseMedia() {
    ticker?.terminate()
    ticker = null
    clearInterval(levelTimer)
    for (const s of [screen, camera, mic, canvasStream]) stopTracks(s)
    mixedAudio?.stop()
    audioCtx?.close().catch(() => {})
    screen = camera = mic = canvasStream = null
    mixedAudio = null
    audioCtx = null
    preview.value = null
  }

  /** Off-main-thread timer: keeps drawing while this tab is in the background. */
  function startTicker(fps: number, onTick: () => void) {
    const src = 'let t;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}'
    ticker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
    ticker.onmessage = onTick
    ticker.postMessage(1000 / fps)
  }

  function videoEl(stream: MediaStream) {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.srcObject = stream
    void v.play()
    return v
  }

  /** Screen + camera bubble, composited on a canvas. */
  function composite(q: { width: number, height: number }) {
    const canvas = document.createElement('canvas')
    canvas.width = q.width
    canvas.height = q.height
    const ctx = canvas.getContext('2d', { alpha: false })!
    const sv = videoEl(screen!)
    const cv = videoEl(camera!)
    const bubble = Math.round(q.height * 0.28)
    const margin = Math.round(q.height * 0.04)

    startTicker(30, () => {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, q.width, q.height)
      if (sv.videoWidth) {
        const s = Math.min(q.width / sv.videoWidth, q.height / sv.videoHeight)
        const w = sv.videoWidth * s
        const h = sv.videoHeight * s
        ctx.drawImage(sv, (q.width - w) / 2, (q.height - h) / 2, w, h)
      }
      if (cv.videoWidth) {
        const x = q.width - bubble - margin
        const y = q.height - bubble - margin
        const side = Math.min(cv.videoWidth, cv.videoHeight)
        ctx.save()
        ctx.beginPath()
        ctx.arc(x + bubble / 2, y + bubble / 2, bubble / 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(cv, (cv.videoWidth - side) / 2, (cv.videoHeight - side) / 2, side, side, x, y, bubble, bubble)
        ctx.restore()
        ctx.lineWidth = Math.max(2, q.height / 270)
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.beginPath()
        ctx.arc(x + bubble / 2, y + bubble / 2, bubble / 2, 0, Math.PI * 2)
        ctx.stroke()
      }
    })
    canvasStream = canvas.captureStream(30)
    return canvasStream.getVideoTracks()[0]!
  }

  /** Mixes mic + screen/tab audio into one track and meters the mic. */
  function mixAudio(): MediaStreamTrack | null {
    const inputs = [mic, screen].filter((s): s is MediaStream => !!s && s.getAudioTracks().length > 0)
    if (!inputs.length) return null
    audioCtx = new AudioContext({ sampleRate: 48000 })
    const dest = audioCtx.createMediaStreamDestination()
    for (const s of inputs) audioCtx.createMediaStreamSource(s).connect(dest)
    if (mic?.getAudioTracks().length) {
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      audioCtx.createMediaStreamSource(mic).connect(analyser)
      const buf = new Uint8Array(analyser.fftSize)
      levelTimer = setInterval(() => {
        analyser.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        micLevel.value = Math.min(1, peak / 100)
      }, 80)
    }
    mixedAudio = dest.stream.getAudioTracks()[0] ?? null
    return mixedAudio
  }

  async function startPreview() {
    error.value = null
    releaseMedia()
    const q = QUALITY[quality.value]
    try {
      if (mode.value !== 'camera') {
        screen = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: 30, max: 30 } },
          audio: true,
        })
        // User clicked "Stop sharing" in the browser bar.
        screen.getVideoTracks()[0]!.addEventListener('ended', () => {
          if (state.value === 'live' || state.value === 'connecting') void stop()
          releaseMedia()
          state.value = 'idle'
        })
      }
      if (mode.value !== 'screen') {
        camera = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: pick(camId.value), width: { ideal: mode.value === 'both' ? 640 : q.width }, height: { ideal: mode.value === 'both' ? 640 : q.height }, frameRate: { ideal: 30 } },
        })
      }
      if (micOn.value) {
        mic = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: pick(micId.value), echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      }
      await loadDevices()
    } catch (e: any) {
      releaseMedia()
      state.value = 'idle'
      error.value = e?.name === 'NotAllowedError' ? 'Permission denied. Allow screen/camera/microphone access and try again.' : (e?.message ?? 'Could not start capture')
      return
    }

    const video = mode.value === 'both' ? composite(q) : (screen ?? camera)!.getVideoTracks()[0]!
    video.contentHint = mode.value === 'camera' ? 'motion' : 'detail'
    const audio = mixAudio()
    preview.value = new MediaStream([video, ...(audio ? [audio] : [])])
    state.value = 'preview'
  }

  async function goLive(whipUrl: string) {
    if (!preview.value) return
    error.value = null
    state.value = 'connecting'
    const q = QUALITY[quality.value]
    try {
      pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' })
      const [video] = preview.value.getVideoTracks()
      const [audio] = preview.value.getAudioTracks()
      const vt = pc.addTransceiver(video!, { direction: 'sendonly', sendEncodings: [{ maxBitrate: q.bitrate, maxFramerate: 30 }] })
      // Prefer H.264 (often hardware-encoded in the browser).
      const caps = RTCRtpSender.getCapabilities?.('video')?.codecs ?? []
      const h264 = caps.filter((c) => /h264/i.test(c.mimeType))
      if (h264.length && vt.setCodecPreferences) vt.setCodecPreferences([...h264, ...caps.filter((c) => !/h264/i.test(c.mimeType))])
      if (audio) pc.addTransceiver(audio, { direction: 'sendonly' })

      pc.addEventListener('connectionstatechange', () => {
        const s = pc?.connectionState
        if (s === 'connected') {
          state.value = 'live'
          startedAt.value ??= Date.now()
        } else if (s === 'failed') {
          error.value = 'Connection to LiveLoom failed. Your network may block WebRTC (UDP/TCP 8189).'
          void stop('error')
        }
      })

      await pc.setLocalDescription(await pc.createOffer())
      await new Promise<void>((resolve) => {
        if (pc!.iceGatheringState === 'complete') return resolve()
        const t = setTimeout(resolve, 2500)
        pc!.addEventListener('icegatheringstatechange', () => {
          if (pc?.iceGatheringState === 'complete') { clearTimeout(t); resolve() }
        })
      })

      const res = await fetch(whipUrl, { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: pc.localDescription!.sdp })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(res.status === 401 ? 'LiveLoom rejected the stream key.' : `LiveLoom refused the stream (${res.status}) ${body.slice(0, 120)}`)
      }
      const loc = res.headers.get('location')
      sessionUrl = loc ? new URL(loc.startsWith('/') && !loc.startsWith('/whip') ? `/whip${loc}` : loc, whipUrl).toString() : null
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() })

      let last = { bytes: 0, t: 0 }
      statsTimer = setInterval(async () => {
        if (!pc) return
        const stats = await pc.getStats()
        let bytes = 0
        stats.forEach((r) => { if (r.type === 'outbound-rtp') bytes += r.bytesSent ?? 0 })
        const now = performance.now()
        if (last.t) kbps.value = Math.round(((bytes - last.bytes) * 8) / (now - last.t))
        last = { bytes, t: now }
      }, 1000)
    } catch (e: any) {
      error.value = e?.message ?? 'Could not go live'
      await stop('error')
    }
  }

  async function stop(next: StreamState = 'preview') {
    clearInterval(statsTimer)
    kbps.value = null
    startedAt.value = null
    if (sessionUrl) fetch(sessionUrl, { method: 'DELETE' }).catch(() => {})
    sessionUrl = null
    pc?.close()
    pc = null
    state.value = preview.value ? next : 'idle'
    if (next === 'error' && !preview.value) state.value = 'idle'
  }

  async function endAll() {
    await stop()
    releaseMedia()
    state.value = 'idle'
  }

  onMounted(() => { void loadDevices().catch(() => {}) })
  onBeforeUnmount(() => { void endAll() })

  return { state, error, mode, quality, micOn, micId, camId, devices, kbps, startedAt, preview, micLevel, startPreview, goLive, stop, endAll }
}
