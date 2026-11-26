import { and, channels, destinations, destinationStatus, eq, inArray, sql, type Db } from '@sp/db'
import { decryptSecret, pushUrl } from '@sp/shared'
import { config } from './config'
import { inputUrl, livePaths } from './mediamtx'
import { Push } from './push'

/**
 * Reconciles "what should be streaming" (DB + MediaMTX) with "what is" (ffmpeg
 * processes). The web app only ever writes to the DB, so it can run anywhere
 * (Cloudflare, VPS) without talking to the relay directly.
 */
export class Supervisor {
  private pushes = new Map<string, Push>()
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
    let live: Set<string>
    try {
      live = await livePaths()
      if (this.mediamtxDown) console.log('[supervisor] MediaMTX reachable again')
      this.mediamtxDown = false
    } catch (e) {
      if (!this.mediamtxDown) console.error('[supervisor] MediaMTX unreachable:', (e as Error).message)
      this.mediamtxDown = true
      return
    }
    const liveKeys = [...live].filter((p) => p.startsWith('live/')).map((p) => p.slice(5))

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
    await this.db
      .update(channels)
      .set({ isLive: false, liveSince: null, updatedAt: now })
      .where(and(eq(channels.isLive, true), liveIds.length ? sql`${channels.id} NOT IN ${liveIds}` : sql`1=1`))

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
      const existing = this.pushes.get(d.id)
      if (existing && existing.version === version) continue
      existing?.stop()
      const key = await decryptSecret(d.streamKeyEnc, config.encryptionKey)
      const p = new Push(d.id, version, inputUrl(ingestKey), pushUrl(d.serverUrl, key), [key, config.relaySecret])
      this.pushes.set(d.id, p)
      p.start()
      console.log(`[supervisor] start push → ${d.platform} (${d.name})`)
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

  private async writeIdle(ids: string[]) {
    await this.db
      .update(destinationStatus)
      .set({ state: 'idle', bitrateKbps: null, startedAt: null, message: null, updatedAt: new Date() })
      .where(inArray(destinationStatus.destinationId, ids))
  }
}
