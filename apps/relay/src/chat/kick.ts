import { partsToText, type ChatPart } from '@sp/shared'
import { BROWSER_UA, ChatSource, socketLifetime } from './source'

const FALLBACK_PUSHER = { appKey: '34bf7a0ff419a2a775b9', cluster: 'us2' }

/**
 * Kick chat via its public Pusher channel (what kick.com itself uses).
 * The Pusher app key is fetched from Kick's realtime API each connect, since
 * Kick rotates it.
 */
export class KickSource extends ChatSource {
  readonly platform = 'kick'
  private ws: WebSocket | null = null
  private pingTimer: Timer | null = null

  protected async connect() {
    const slug = this.target.toLowerCase().replace(/^@/, '')
    const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
      headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 404) throw new Error('Kick channel not found')
    if (!res.ok) throw new Error(`Kick API ${res.status}`)
    const channel = (await res.json()) as { id: number, chatroom?: { id: number } }
    const chatroomId = channel.chatroom?.id
    if (!chatroomId) throw new Error('Kick chatroom not found')
    const { appKey, cluster } = await pusherConfig(channel.id).catch(() => FALLBACK_PUSHER)

    const ws = new WebSocket(`wss://ws-${cluster}.pusher.com/app/${appKey}?protocol=7&client=js&version=8.4.0&flash=false`)
    this.ws = ws
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(String(e.data)) as { event: string, data?: string }
      switch (m.event) {
        case 'pusher:connection_established':
          ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel: `chatrooms.${chatroomId}.v2` } }))
          break
        case 'pusher_internal:subscription_succeeded':
          this.connected()
          break
        case 'pusher:ping':
          ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }))
          break
        case 'pusher:error':
          ws.close()
          break
        case 'App\\Events\\ChatMessageEvent':
          if (m.data) this.onChat(JSON.parse(m.data))
          break
      }
    })
    this.pingTimer = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ event: 'pusher:ping', data: {} })), 60_000)
    try {
      await socketLifetime(ws)
    } finally {
      if (this.pingTimer) clearInterval(this.pingTimer)
    }
  }

  protected close() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.ws?.close()
    this.ws = null
  }

  private onChat(d: KickChatEvent) {
    const badges = (d.sender?.identity?.badges ?? []).map((b) => b.type)
    const parts = parseKickEmotes(d.content ?? '')
    this.events.onMessage({
      id: `kk:${d.id}`,
      platform: 'kick',
      author: { name: d.sender?.username ?? 'unknown', color: d.sender?.identity?.color, badges },
      parts,
      text: partsToText(parts),
      ts: d.created_at ? Date.parse(d.created_at) : Date.now(),
    })
  }
}

interface KickChatEvent {
  id: string
  content?: string
  created_at?: string
  sender?: { username: string, identity?: { color?: string, badges?: { type: string }[] } }
}

async function pusherConfig(channelId: number) {
  const res = await fetch(`https://web.kick.com/api/v1/realtime/channels/${channelId}/chat/connection`, {
    method: 'POST',
    headers: { 'user-agent': BROWSER_UA, 'content-type': 'application/json', origin: 'https://kick.com' },
    body: JSON.stringify({
      client: { id: crypto.randomUUID(), type: 'web' },
      capabilities: { accepted_providers: [{ provider: 'pusher' }] },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = (await res.json()) as { data?: { connections?: { provider: string, credentials: { app_key?: string, cluster?: string } }[] } }
  const p = body.data?.connections?.find((c) => c.provider === 'pusher')?.credentials
  if (!p?.app_key || !p.cluster) throw new Error('no pusher config')
  return { appKey: p.app_key, cluster: p.cluster }
}

/** "[emote:37226:KEKW]" → emote image */
function parseKickEmotes(content: string): ChatPart[] {
  const parts: ChatPart[] = []
  const re = /\[emote:(\d+):([^\]]*)\]/g
  let i = 0
  for (let m; (m = re.exec(content));) {
    if (m.index > i) parts.push({ t: 'text', v: content.slice(i, m.index) })
    parts.push({ t: 'emote', name: m[2]!, url: `https://files.kick.com/emotes/${m[1]}/fullsize` })
    i = m.index + m[0].length
  }
  if (i < content.length) parts.push({ t: 'text', v: content.slice(i) })
  return parts
}
