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
 * Browser (WebRTC) streams → H.264 High, 2 s keyframes at 30 fps, AAC 48 kHz.
 * One encode per channel, shared by every destination.
 */
const NORMALIZE_ARGS = [
  '-map', '0:v:0', '-map', '0:a:0?',
  '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-r', '30', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
  '-b:v', '4500k', '-maxrate', '4500k', '-bufsize', '9000k',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
]

export class Supervisor {
  private pushes = new Map<string, Push>()
  /** channelId → normalizer for browser streams */
  private normalizers = new Map<string, Push>()
  /** channelId → next probe time (only for live channels) */
  private probes = new Map<string, number>()
  private probing = new Set<string>()
  private health = new Map<string, IngestHealth>()
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
    for (const c of liveChannels) {
      const info = live.get(ingestPath(c.ingestKey))!
      let n = this.normalizers.get(c.id)
      if (needsNormalize(info)) {
        if (!n) {
          n = new Push(`norm:${c.id}`, 0, rtspUrl(ingestPath(c.ingestKey)), rtmpUrl(normalizedPath(c.ingestKey)), [config.relaySecret, c.ingestKey], NORMALIZE_ARGS)
          this.normalizers.set(c.id, n)
          n.start()
          console.log(`[supervisor] normalizing browser stream (${info.sourceType}: ${info.tracks.join(', ')})`)
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
    const wanted = liveIds.length
      ? await this.db
          .select({ d: destinations, ingestKey: channels.ingestKey })
          .from(destinations)
          .innerJoin(channels, eq(destinations.channelId, channels.id))
          .where(and(inArray(destinations.channelId, liveIds), eq(destinations.enabled, true)))
      : []
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
  }

  private async probe(channelId: string, input: string, platforms: PlatformId[]) {
    this.probing.add(channelId)
    try {
      const h = await probeIngest(input)
      if (!h || !this.probes.has(channelId)) return
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
