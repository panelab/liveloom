import { channels, eq, inArray, type Db } from '@sp/db'
import type { ChatEvent, ChatMessage, ChatPlatform, ChatSourceStatus } from '@sp/shared'
import { KickSource } from './kick'
import type { ChatSource } from './source'
import { TwitchSource } from './twitch'
import { YouTubeSource } from './youtube'

const HISTORY = 100
const IDLE_STOP_MS = 60_000
const PLATFORMS: ChatPlatform[] = ['twitch', 'kick', 'youtube']

type Send = (ev: ChatEvent) => void
type Targets = Record<ChatPlatform, string | null>

const factories: Record<ChatPlatform, new (target: string, ev: ConstructorParameters<typeof TwitchSource>[1]) => ChatSource> = {
  twitch: TwitchSource,
  kick: KickSource,
  youtube: YouTubeSource,
}

/** Merged chat for one channel: its platform connections, history and listeners. */
class ChannelChat {
  readonly subscribers = new Set<Send>()
  health: ChatEvent | null = null
  private sources = new Map<ChatPlatform, ChatSource>()
  private status = new Map<ChatPlatform, ChatSourceStatus>()
  private history: ChatMessage[] = []
  idleTimer: Timer | null = null

  constructor(readonly channelId: string) {
    for (const p of PLATFORMS) this.status.set(p, { platform: p, target: null, state: 'off' })
  }

  apply(targets: Targets) {
    for (const p of PLATFORMS) {
      const target = targets[p]?.trim() || null
      const cur = this.sources.get(p)
      if (cur && cur.target === target) continue
      cur?.stop()
      this.sources.delete(p)
      this.setStatus({ platform: p, target, state: 'off' })
      if (!target) continue
      const src = new factories[p](target, {
        onMessage: (m) => this.push(m),
        onState: (state, message) => this.sources.get(p) === src && this.setStatus({ platform: p, target, state, message }),
      })
      this.sources.set(p, src)
      src.start()
    }
  }

  stop() {
    for (const s of this.sources.values()) s.stop()
    this.sources.clear()
  }

  setHealth(ev: ChatEvent) {
    this.health = ev
    this.broadcast(ev)
  }

  hello(): ChatEvent {
    return { type: 'hello', history: this.history, sources: [...this.status.values()] }
  }

  private push(m: ChatMessage) {
    this.history.push(m)
    if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY)
    this.broadcast({ type: 'message', message: m })
  }

  private setStatus(s: ChatSourceStatus) {
    const prev = this.status.get(s.platform)
    if (prev && prev.state === s.state && prev.target === s.target && prev.message === s.message) return
    this.status.set(s.platform, s)
    this.broadcast({ type: 'status', sources: [...this.status.values()] })
  }

  broadcast(ev: ChatEvent) {
    for (const send of this.subscribers) send(ev)
  }
}

/**
 * Starts platform connections only while someone (OBS plugin, overlay,
 * dashboard) is listening, and picks up config changes from the DB.
 */
export class ChatHub {
  private chats = new Map<string, ChannelChat>()
  /** Latest health event per channel, kept even with no listeners. */
  private lastHealth = new Map<string, ChatEvent>()

  publishHealth(channelId: string, live: boolean, issues: { level: string, title: string, fix: string }[]) {
    const ev: ChatEvent = { type: 'health', live, issues: issues.map(({ level, title, fix }) => ({ level, title, fix })) }
    if (live) this.lastHealth.set(channelId, ev)
    else this.lastHealth.delete(channelId)
    this.chats.get(channelId)?.setHealth(ev)
  }
  private timer: Timer | null = null

  constructor(private db: Db) {}

  start() {
    this.timer = setInterval(() => void this.refreshConfigs().catch((e) => console.error('[chat]', e)), 5000)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    for (const c of this.chats.values()) c.stop()
    this.chats.clear()
  }

  async channelForToken(token: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
    const [row] = await this.db.select().from(channels).where(eq(channels.chatToken, token)).limit(1)
    return row ?? null
  }

  async subscribe(channel: typeof channels.$inferSelect, send: Send): Promise<() => void> {
    let chat = this.chats.get(channel.id)
    if (!chat) {
      chat = new ChannelChat(channel.id)
      this.chats.set(channel.id, chat)
      chat.apply(targetsOf(channel))
      console.log(`[chat] start ${channel.id.slice(0, 8)}`)
    }
    if (chat.idleTimer) clearTimeout(chat.idleTimer)
    chat.idleTimer = null
    chat.subscribers.add(send)
    send(chat.hello())
    const health = this.lastHealth.get(channel.id)
    if (health) send(health)

    return () => {
      chat.subscribers.delete(send)
      if (chat.subscribers.size === 0) {
        chat.idleTimer = setTimeout(() => {
          if (chat.subscribers.size) return
          chat.stop()
          this.chats.delete(channel.id)
          console.log(`[chat] stop ${channel.id.slice(0, 8)} (no listeners)`)
        }, IDLE_STOP_MS)
      }
    }
  }

  private async refreshConfigs() {
    if (!this.chats.size) return
    const rows = await this.db.select().from(channels).where(inArray(channels.id, [...this.chats.keys()]))
    for (const row of rows) this.chats.get(row.id)?.apply(targetsOf(row))
  }
}

function targetsOf(c: typeof channels.$inferSelect): Targets {
  return { twitch: c.twitchLogin, kick: c.kickSlug, youtube: c.youtubeHandle }
}
