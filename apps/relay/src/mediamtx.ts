import { config } from './config'

export const RELAY_USER = 'relay'
const auth = 'Basic ' + btoa(`${RELAY_USER}:${config.relaySecret}`)

interface PathItem {
  name: string
  ready?: boolean
  online?: boolean
  available?: boolean
  source?: { type?: string } | null
  /** Deprecated but present in v1.x: codec names, e.g. ["H264", "MPEG-4 Audio"] */
  tracks?: string[]
  tracks2?: { codec?: string }[]
}

export interface LivePath {
  name: string
  /** e.g. "rtmpConn", "webRTCSession", "srtConn" */
  sourceType: string | null
  tracks: string[]
}

/** Paths that currently have a publisher. */
export async function livePaths(): Promise<Map<string, LivePath>> {
  const res = await fetch(`${config.mediamtxApi}/v3/paths/list?itemsPerPage=1000`, {
    headers: { authorization: auth },
    signal: AbortSignal.timeout(3000),
  })
  if (!res.ok) throw new Error(`MediaMTX API ${res.status}`)
  const body = (await res.json()) as { items?: PathItem[] }
  const out = new Map<string, LivePath>()
  for (const p of body.items ?? []) {
    if (!(p.ready ?? p.online ?? p.available)) continue
    const tracks = p.tracks?.length ? p.tracks : (p.tracks2 ?? []).map((t) => t.codec ?? '').filter(Boolean)
    out.set(p.name, { name: p.name, sourceType: p.source?.type ?? null, tracks })
  }
  return out
}

/**
 * RTMP destinations accept H.264 video + AAC audio. Anything else (browser
 * WebRTC: Opus audio, VP8/VP9/AV1 video, irregular keyframes) is normalized
 * once by the relay before fan-out.
 */
export function needsNormalize(p: LivePath): boolean {
  if (p.sourceType === 'webRTCSession') return true
  return p.tracks.some((t) => t !== 'H264' && t !== 'MPEG-4 Audio')
}

const creds = () => new URLSearchParams({ user: RELAY_USER, pass: config.relaySecret })

/** RTMP URL the relay's ffmpeg reads from (authenticated as the relay user). */
export function rtmpUrl(path: string): string {
  return `${config.mediamtxRtmp}/${path}?${creds()}`
}

/** RTSP URL (carries any codec, incl. Opus) for reading browser streams. */
export function rtspUrl(path: string): string {
  const u = new URL(`${config.mediamtxRtsp}/${path}`)
  u.username = RELAY_USER
  u.password = config.relaySecret
  return u.toString()
}

export function ingestPath(ingestKey: string) {
  return `live/${ingestKey}`
}

/** Where the normalized copy of a browser stream is published. */
export function normalizedPath(ingestKey: string) {
  return `live/${ingestKey}/out`
}

