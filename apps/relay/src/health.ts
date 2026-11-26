import type { IngestHealth } from '@sp/shared'
import { config } from './config'

interface ProbeStream {
  index: number
  codec_type: string
  codec_name: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
  sample_rate?: string
  channels?: number
}
interface ProbePacket {
  stream_index: number
  pts_time?: string
  size?: string
  flags?: string
}

function fps(rate?: string): number {
  if (!rate) return 0
  const [n, d] = rate.split('/').map(Number)
  return d ? n! / d : Number(n) || 0
}

/** Reads ~10 s of the live ingest and measures what platforms will receive. */
export async function probeIngest(inputUrl: string, seconds = 10): Promise<IngestHealth | null> {
  const proc = Bun.spawn([
    config.ffmpegPath.replace(/ffmpeg$/, 'ffprobe'),
    '-v', 'error',
    '-rw_timeout', '15000000',
    '-read_intervals', `%+${seconds}`,
    '-show_entries', 'stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,sample_rate,channels',
    '-show_entries', 'packet=stream_index,pts_time,size,flags',
    '-of', 'json',
    inputUrl,
  ], { stdout: 'pipe', stderr: 'ignore' })
  const timer = setTimeout(() => proc.kill(), (seconds + 20) * 1000)
  const text = await new Response(proc.stdout).text()
  clearTimeout(timer)
  await proc.exited
  let data: { streams?: ProbeStream[], packets?: ProbePacket[] }
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  const streams = data.streams ?? []
  const packets = data.packets ?? []
  const vs = streams.find((s) => s.codec_type === 'video')
  const as = streams.find((s) => s.codec_type === 'audio')

  const measure = (index: number | undefined) => {
    if (index === undefined) return { kbps: null as number | null, keyGap: null as number | null }
    const ps = packets.filter((p) => p.stream_index === index && p.pts_time !== undefined)
    if (ps.length < 2) return { kbps: null, keyGap: null }
    const t0 = Number(ps[0]!.pts_time)
    const t1 = Number(ps[ps.length - 1]!.pts_time)
    const bytes = ps.reduce((n, p) => n + Number(p.size ?? 0), 0)
    const kbps = t1 > t0 ? Math.round((bytes * 8) / 1000 / (t1 - t0)) : null
    const keys = ps.filter((p) => p.flags?.startsWith('K')).map((p) => Number(p.pts_time))
    let keyGap: number | null = null
    for (let i = 1; i < keys.length; i++) keyGap = Math.max(keyGap ?? 0, keys[i]! - keys[i - 1]!)
    // One keyframe in the whole window means the interval is at least the window length.
    if (keys.length === 1 && t1 - t0 > 3) keyGap = t1 - t0
    return { kbps, keyGap: keyGap === null ? null : Math.round(keyGap * 100) / 100 }
  }

  const vm = measure(vs?.index)
  const am = measure(as?.index)
  return {
    checkedAt: Date.now(),
    video: vs
      ? {
          codec: vs.codec_name,
          width: vs.width ?? 0,
          height: vs.height ?? 0,
          fps: Math.round((fps(vs.avg_frame_rate) || fps(vs.r_frame_rate)) * 100) / 100,
          keyframeInterval: vm.keyGap,
          bitrateKbps: vm.kbps,
        }
      : null,
    audio: as
      ? { codec: as.codec_name, sampleRate: Number(as.sample_rate) || 0, channels: as.channels ?? 0, bitrateKbps: am.kbps }
      : null,
    totalKbps: vm.kbps === null && am.kbps === null ? null : (vm.kbps ?? 0) + (am.kbps ?? 0),
  }
}
