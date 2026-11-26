import { and, channels, destinations, destinationStatus, eq, inArray, sql, type Db } from '@sp/db'
import { decryptSecret, healthIssues, pushUrl, type IngestHealth, type PlatformId } from '@sp/shared'
import { probeIngest } from './health'
import { config } from './config'
import { ingestPath, livePaths, needsNormalize, normalizedPath, rtmpUrl, rtspUrl, type LivePath } from './mediamtx'
import { Push } from './push'

/**
 * Reconciles "what should be streaming" (DB + MediaMTX) with "what is" (ffmpeg
 * processes). The web app only ever writes to the DB, so it can run anywhere
 * (Cloudflare, VPS) without talking to the relay directly.
 */
export type HealthListener = (channelId: string, live: boolean, issues: ReturnType<typeof healthIssues>) => void

const PROBE_FIRST_MS = 8_000
const PROBE_EVERY_MS = 5 * 60_000

/**
 * Browser (WebRTC) streams → 1080p30 H.264 High at 6 Mbps (the most every
 * platform accepts, incl. Twitch), 2 s keyframes, AAC 160k 48 kHz.
 * One encode per channel, shared by every destination.
 *
 * - Fixed output size: WebRTC lowers resolution on a bad network, and
 *   platforms handle mid-stream size changes badly, so always scale/pad to
 *   1920×1080.
 * - No `-tune zerolatency`: B-frames and lookahead give visibly better
 *   quality for ~0.5 s extra latency, which is nothing next to platform delay.
 * - `aresample=async` + a silent fallback keep audio continuous, so players
 *   don't stall when the browser has no microphone or drops packets.
 */
const normalizeArgs = (preset: string) => [
  '-fflags', '+genpts+discardcorrupt',
  '-map', '0:v:0', '-map', '0:a:0?',
  '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p',
  '-c:v', 'libx264', '-preset', preset, '-profile:v', 'high', '-level', '4.1',
  '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-bf', '2', '-rc-lookahead', '15',
  '-b:v', '6000k', '-maxrate', '6000k', '-bufsize', '6000k', '-x264-params', 'nal-hrd=cbr:aq-mode=3',
  '-af', 'aresample=async=1000:first_pts=0',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
  '-max_muxing_queue_size', '1024',
]

const VIDEO_CODEC = /^(H26[45]|VP[89]|AV1|MPEG-[124] Video|M-JPEG)$/i
const NO_VIDEO_MESSAGE = 'LiveLoom is receiving audio but no video. Stop and go live again; if it keeps happening, try another browser.'

export class Supervisor {
  private pushes = new Map<string, Push>()
  /** channelId → normalizer for browser streams */
  private normalizers = new Map<string, Push>()
  /** channelId → next probe time (only for live channels) */
  private probes = new Map<string, number>()
  private probing = new Set<string>()
  private health = new Map<string, IngestHealth>()
  private noVideoLogged = new Set<string>()
  onHealth: HealthListener = () => {}
  private ticking = false
  private timer: Timer | null = null
  private mediamtxDown = false

  constructor(private db: Db) {}

  start() {
    this.timer = setInterval(() => void this.tick(), config.tickMs)
    void this.tick()
  }

  async stop() {
    if (this.timer) clearInterval(this.timer)
    const ids = [...this.pushes.keys()]
    for (const p of this.pushes.values()) p.stop()
    this.pushes.clear()
    for (const n of this.normalizers.values()) n.stop()
    this.normalizers.clear()
    if (ids.length) await this.writeIdle(ids)
    await this.db.update(channels).set({ isLive: false, liveSince: null }).where(eq(channels.isLive, true))
  }

  private async tick() {
    if (this.ticking) return
    this.ticking = true
    try {
      await this.reconcile()
    } catch (e) {
      console.error('[supervisor]', e instanceof Error ? e.message : e)
    } finally {
      this.ticking = false
    }
  }

  private async reconcile() {
    let live: Map<string, LivePath>
    try {
      live = await livePaths()
      if (this.mediamtxDown) console.log('[supervisor] MediaMTX reachable again')
      this.mediamtxDown = false
    } catch (e) {
      if (!this.mediamtxDown) console.error('[supervisor] MediaMTX unreachable:', (e as Error).message)
      this.mediamtxDown = true
      return
    }
    // Top-level ingest paths only ("live/<key>"), not the relay's own "live/<key>/out".
    const liveKeys = [...live.keys()].filter((p) => /^live\/[A-Za-z0-9_-]+$/.test(p)).map((p) => p.slice(5))

    // 1. Sync channel live flags.
    const liveChannels = liveKeys.length
      ? await this.db.select().from(channels).where(inArray(channels.ingestKey, liveKeys))
      : []
    const liveIds = liveChannels.map((c) => c.id)
    const now = new Date()
    const newlyLive = liveChannels.filter((c) => !c.isLive).map((c) => c.id)
    if (newlyLive.length) {
      await this.db.update(channels).set({ isLive: true, liveSince: now, updatedAt: now }).where(inArray(channels.id, newlyLive))
      console.log(`[supervisor] live: ${newlyLive.length} channel(s)`)
      // Push the saved title/description now and again later (YouTube creates its live video a bit after ingest starts).
      for (const id of newlyLive) for (const ms of [15_000, 75_000]) setTimeout(() => void this.applyStreamInfo(id), ms)
    }
    for (const c of liveChannels) if (!this.probes.has(c.id)) this.probes.set(c.id, Date.now() + PROBE_FIRST_MS)
    for (const id of [...this.probes.keys()]) {
      if (!liveIds.includes(id)) {
        this.probes.delete(id)
        this.health.delete(id)
        await this.db.update(channels).set({ ingestHealth: null }).where(eq(channels.id, id))
        this.onHealth(id, false, [])
      }
    }
    await this.db
      .update(channels)
      .set({ isLive: false, liveSince: null, updatedAt: now })
      .where(and(eq(channels.isLive, true), liveIds.length ? sql`${channels.id} NOT IN ${liveIds}` : sql`1=1`))

    // 1b. Browser streams get one normalizer each; destinations read its output.
    const sourceFor = new Map<string, string>() // channelId → RTMP input URL for pushes
    const noVideo = new Set<string>() // live channels sending audio only: nothing to push yet
    for (const c of liveChannels) {
      const info = live.get(ingestPath(c.ingestKey))!
      if (!info.tracks.some((t) => VIDEO_CODEC.test(t))) {
        if (!this.noVideoLogged.has(c.id)) console.warn(`[supervisor] ${c.id.slice(0, 8)} has no video track (${info.tracks.join(', ') || 'none'})`)
        this.noVideoLogged.add(c.id)
        noVideo.add(c.id)
        this.normalizers.get(c.id)?.stop()
        this.normalizers.delete(c.id)
        continue
      }
      this.noVideoLogged.delete(c.id)
      let n = this.normalizers.get(c.id)
      if (needsNormalize(info)) {
        if (!n) {
          // "fast" looks clearly better but needs ~55% of a 4-core VPS; use it
          // for the first browser stream and "veryfast" for any extra ones.
          const preset = this.normalizers.size === 0 ? 'fast' : 'veryfast'
          n = new Push(`norm:${c.id}`, 0, rtspUrl(ingestPath(c.ingestKey)), rtmpUrl(normalizedPath(c.ingestKey)), [config.relaySecret, c.ingestKey], normalizeArgs(preset))
          this.normalizers.set(c.id, n)
          n.start()
          console.log(`[supervisor] normalizing browser stream (${info.sourceType}: ${info.tracks.join(', ')}) preset=${preset}`)
        }
        sourceFor.set(c.id, rtmpUrl(normalizedPath(c.ingestKey)))
      } else {
        if (n) {
          n.stop()
          this.normalizers.delete(c.id)
        }
        sourceFor.set(c.id, rtmpUrl(ingestPath(c.ingestKey)))
      }
    }
    for (const [id, n] of this.normalizers) {
      if (!liveIds.includes(id)) {
        n.stop()
        this.normalizers.delete(id)
      }
    }

    // 2. Desired pushes = enabled destinations of live channels.
    const wantedAll = liveIds.length
      ? await this.db
          .select({ d: destinations, ingestKey: channels.ingestKey })
          .from(destinations)
          .innerJoin(channels, eq(destinations.channelId, channels.id))
          .where(and(inArray(destinations.channelId, liveIds), eq(destinations.enabled, true)))
      : []
    const wanted = wantedAll.filter((w) => !noVideo.has(w.d.channelId))
    const wantedIds = new Set(wanted.map((w) => w.d.id))

    // 3. Stop pushes that are no longer wanted.
    const stoppedIds: string[] = []
    for (const [id, p] of this.pushes) {
      if (!wantedIds.has(id)) {
        p.stop()
        this.pushes.delete(id)
        stoppedIds.push(id)
      }
    }

    // 4. Start new pushes / restart edited ones.
    for (const { d, ingestKey } of wanted) {
      const version = d.updatedAt.getTime()
      const input = sourceFor.get(d.channelId)!
      const existing = this.pushes.get(d.id)
      if (existing && existing.version === version && existing.input === input) continue
      existing?.stop()
      const key = await decryptSecret(d.streamKeyEnc, config.encryptionKey)
      const p = new Push(d.id, version, input, pushUrl(d.serverUrl, key), [key, config.relaySecret, ingestKey])
      this.pushes.set(d.id, p)
      p.start()
      console.log(`[supervisor] start push → ${d.platform} (${d.name})`)
    }

    // 4b. Measure ingest health (background, one probe per channel at a time).
    for (const c of liveChannels) {
      if (noVideo.has(c.id)) continue
      const due = this.probes.get(c.id) ?? 0
      if (Date.now() < due || this.probing.has(c.id)) continue
      this.probes.set(c.id, Date.now() + PROBE_EVERY_MS)
      const platforms = wanted.filter((w) => w.d.channelId === c.id).map((w) => w.d.platform as PlatformId)
      void this.probe(c.id, sourceFor.get(c.id)!, platforms)
    }

    // 5. Publish status.
    if (stoppedIds.length) await this.writeIdle(stoppedIds)
    for (const p of this.pushes.values()) {
      const row = {
        destinationId: p.destinationId,
        state: p.state,
        message: p.message,
        bitrateKbps: p.bitrateKbps,
        startedAt: p.startedAt ? new Date(p.startedAt) : null,
        updatedAt: now,
      }
      await this.db.insert(destinationStatus).values(row).onConflictDoUpdate({ target: destinationStatus.destinationId, set: row })
    }
    // Anything still marked active but not running here (e.g. after a crash) → idle.
    await this.db
      .update(destinationStatus)
      .set({ state: 'idle', bitrateKbps: null, startedAt: null, message: null, updatedAt: now })
      .where(and(
        sql`${destinationStatus.state} != 'idle'`,
        this.pushes.size ? sql`${destinationStatus.destinationId} NOT IN ${[...this.pushes.keys()]}` : sql`1=1`,
      ))
    // Audio-only streams: tell the user why nothing is going out.
    for (const w of wantedAll.filter((w) => noVideo.has(w.d.channelId))) {
      const row = { destinationId: w.d.id, state: 'error' as const, message: NO_VIDEO_MESSAGE, bitrateKbps: null, startedAt: null, updatedAt: now }
      await this.db.insert(destinationStatus).values(row).onConflictDoUpdate({ target: destinationStatus.destinationId, set: row })
    }
  }

  private async probe(channelId: string, input: string, platforms: PlatformId[]) {
    this.probing.add(channelId)
    try {
      const h = await probeIngest(input)
      if (!h?.video || !this.probes.has(channelId)) return
      this.health.set(channelId, h)
      await this.db.update(channels).set({ ingestHealth: JSON.stringify(h) }).where(eq(channels.id, channelId))
      const issues = healthIssues(h, platforms)
      console.log(`[health] ${channelId.slice(0, 8)}: ${h.video?.width}x${h.video?.height}@${h.video?.fps} key=${h.video?.keyframeInterval}s ${h.totalKbps}kbps · ${issues.length} issue(s)`)
      this.onHealth(channelId, true, issues)
    } catch (e) {
      console.error('[health]', e instanceof Error ? e.message : e)
    } finally {
      this.probing.delete(channelId)
    }
  }

  private async applyStreamInfo(channelId: string) {
    try {
      const res = await fetch(`${config.webInternalUrl}/api/internal/stream-info`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-relay-secret': config.relaySecret },
        body: JSON.stringify({ channelId }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) console.warn(`[stream-info] ${res.status} ${(await res.text()).slice(0, 160)}`)
    } catch (e) {
      console.warn('[stream-info]', e instanceof Error ? e.message : e)
    }
  }

  /** Last measured issues for a live channel (for new dock connections). */
  issuesFor(channelId: string, platforms: PlatformId[]) {
    const h = this.health.get(channelId)
    return h ? healthIssues(h, platforms) : null
  }

  private async writeIdle(ids: string[]) {
    await this.db
      .update(destinationStatus)
      .set({ state: 'idle', bitrateKbps: null, startedAt: null, message: null, updatedAt: new Date() })
      .where(inArray(destinationStatus.destinationId, ids))
  }
}
