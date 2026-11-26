import type { PlatformId } from './platforms'

/** What the relay measured from the stream OBS is sending. */
export interface IngestHealth {
  checkedAt: number
  video: {
    codec: string
    width: number
    height: number
    fps: number
    /** Seconds between keyframes (max observed) */
    keyframeInterval: number | null
    /** Estimated video bitrate, kbps */
    bitrateKbps: number | null
  } | null
  audio: {
    codec: string
    sampleRate: number
    channels: number
    bitrateKbps: number | null
  } | null
  /** Total measured ingest bitrate (video + audio), kbps */
  totalKbps: number | null
}

export type HealthLevel = 'error' | 'warning' | 'info'

export interface HealthIssue {
  id: string
  level: HealthLevel
  title: string
  /** The exact change to make, written for OBS users */
  fix: string
  platforms?: PlatformId[]
}

/** Per-platform ingest limits (published recommendations, 2026). */
const LIMITS: Partial<Record<PlatformId, { name: string, maxKbps: number, maxHeight: number, maxFps: number }>> = {
  twitch: { name: 'Twitch', maxKbps: 6000, maxHeight: 1080, maxFps: 60 },
  kick: { name: 'Kick', maxKbps: 8000, maxHeight: 1080, maxFps: 60 },
  youtube: { name: 'YouTube', maxKbps: 51000, maxHeight: 2160, maxFps: 60 },
  facebook: { name: 'Facebook', maxKbps: 9000, maxHeight: 1080, maxFps: 60 },
  tiktok: { name: 'TikTok', maxKbps: 6000, maxHeight: 1920, maxFps: 60 },
}

const OUTPUT = 'OBS → Settings → Output (Output Mode: Advanced) → Streaming'

/**
 * Turns measurements into actionable fixes for the platforms the user is
 * actually streaming to. Tolerances avoid nagging about tiny deviations.
 */
export function healthIssues(h: IngestHealth | null, platforms: PlatformId[]): HealthIssue[] {
  if (!h) return []
  const out: HealthIssue[] = []
  const v = h.video
  const a = h.audio
  const active = [...new Set(platforms)]

  if (!v) {
    out.push({ id: 'no-video', level: 'error', title: 'No video in your stream', fix: 'Add a video source (Display/Window/Screen Capture) to your OBS scene.' })
  } else {
    if (v.codec !== 'h264') {
      out.push({
        id: 'codec',
        level: 'error',
        title: `Video codec is ${v.codec.toUpperCase()}`,
        fix: `Most platforms only accept H.264 over RTMP. In ${OUTPUT}, set Video Encoder to an H.264 / x264 option.`,
      })
    }
    if (v.keyframeInterval != null && v.keyframeInterval > 2.5) {
      out.push({
        id: 'keyframes',
        level: v.keyframeInterval > 4.5 ? 'error' : 'warning',
        title: `Keyframe every ${v.keyframeInterval.toFixed(1)} s`,
        fix: `Platforms expect a keyframe every 2 s; longer intervals make streams slow to start and hurt quality. In ${OUTPUT}, set Keyframe Interval to 2.`,
        platforms: active,
      })
    }
    for (const p of active) {
      const lim = LIMITS[p]
      if (!lim) continue
      if (h.totalKbps && h.totalKbps > lim.maxKbps * 1.08) {
        out.push({
          id: `bitrate-${p}`,
          level: 'warning',
          title: `${Math.round(h.totalKbps / 100) / 10} Mbps is above ${lim.name}'s ${lim.maxKbps / 1000} Mbps limit`,
          fix: `Viewers on ${lim.name} may buffer or get lower quality. In ${OUTPUT}, set Video Bitrate to ${lim.maxKbps - 500} Kbps or lower.`,
          platforms: [p],
        })
      }
      if (v.height > lim.maxHeight) {
        out.push({
          id: `res-${p}`,
          level: 'warning',
          title: `${v.height}p is above ${lim.name}'s ${lim.maxHeight}p maximum`,
          fix: `In OBS → Settings → Video, set Output (Scaled) Resolution to ${lim.maxHeight === 1080 ? '1920x1080' : `${lim.maxHeight}p`}.`,
          platforms: [p],
        })
      }
      if (v.fps > lim.maxFps + 1) {
        out.push({
          id: `fps-${p}`,
          level: 'warning',
          title: `${Math.round(v.fps)} fps is above ${lim.name}'s ${lim.maxFps} fps maximum`,
          fix: 'In OBS → Settings → Video, set Common FPS Values to 60 or 30.',
          platforms: [p],
        })
      }
    }
  }

  if (!a) {
    out.push({ id: 'no-audio', level: 'warning', title: 'No audio in your stream', fix: 'Add a Desktop Audio or Mic source in OBS. Some platforms reject streams without audio.' })
  } else {
    if (a.codec !== 'aac') {
      out.push({ id: 'audio-codec', level: 'error', title: `Audio codec is ${a.codec.toUpperCase()}`, fix: `In ${OUTPUT}, set Audio Encoder to AAC.` })
    }
    if (a.sampleRate && a.sampleRate !== 44100 && a.sampleRate !== 48000) {
      out.push({ id: 'samplerate', level: 'warning', title: `Audio sample rate ${a.sampleRate} Hz`, fix: 'In OBS → Settings → Audio, set Sample Rate to 48 kHz.' })
    }
  }

  // Dedupe bitrate warnings: keep only the strictest platform's message.
  const bitrate = out.filter((i) => i.id.startsWith('bitrate-'))
  if (bitrate.length > 1) {
    const strictest = bitrate.reduce((m, i) => (LIMITS[i.platforms![0]!]!.maxKbps < LIMITS[m.platforms![0]!]!.maxKbps ? i : m))
    return out.filter((i) => !i.id.startsWith('bitrate-') || i === strictest)
  }
  return out
}
