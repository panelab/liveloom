import { partsToText, type ChatPart } from '@sp/shared'
import { ChatSource, socketLifetime } from './source'

/**
 * Twitch chat over the public IRC WebSocket. Reading needs no login: the
 * "justinfan" nick is Twitch's documented anonymous read-only user.
 */
export class TwitchSource extends ChatSource {
  readonly platform = 'twitch'
  private ws: WebSocket | null = null

  protected async connect() {
    const login = this.target.toLowerCase().replace(/^#/, '')
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
    this.ws = ws
    ws.addEventListener('open', () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
      ws.send('PASS SCHMOOPIIE')
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`)
      ws.send(`JOIN #${login}`)
    })
    ws.addEventListener('message', (e) => {
      for (const line of String(e.data).split('\r\n')) {
        if (!line) continue
        if (line.startsWith('PING')) ws.send(line.replace('PING', 'PONG'))
        else if (line.includes(` 366 `)) this.connected()
        else if (line.includes(' PRIVMSG ')) this.onPrivmsg(line)
        else if (line.includes(' RECONNECT')) ws.close()
        else if (line.includes(' NOTICE ') && /msg_channel_suspended|No such channel/i.test(line)) {
          this.events.onState('error', 'Twitch channel not found')
        }
      }
    })
    await socketLifetime(ws)
  }

  protected close() {
    this.ws?.close()
    this.ws = null
  }

  private onPrivmsg(line: string) {
    // @tags :nick!nick@nick.tmi.twitch.tv PRIVMSG #chan :text
    let tags: Record<string, string> = {}
    let rest = line
    if (line.startsWith('@')) {
      const sp = line.indexOf(' ')
      tags = Object.fromEntries(line.slice(1, sp).split(';').map((kv) => {
        const i = kv.indexOf('=')
        return [kv.slice(0, i), unescapeTag(kv.slice(i + 1))]
      }))
      rest = line.slice(sp + 1)
    }
    const nick = rest.slice(1, rest.indexOf('!'))
    const textStart = rest.indexOf(' :', rest.indexOf(' PRIVMSG '))
    let text = textStart >= 0 ? rest.slice(textStart + 2) : ''
    // /me actions
    const action = /^\u0001ACTION (.*)\u0001$/.exec(text)
    if (action) text = action[1]!

    const badges = (tags.badges ?? '').split(',').map((b) => b.split('/')[0]!).filter(Boolean)
    const parts = parseEmotes(text, tags.emotes ?? '')
    this.events.onMessage({
      id: `tw:${tags.id ?? crypto.randomUUID()}`,
      platform: 'twitch',
      author: { name: tags['display-name'] || nick, color: tags.color || undefined, badges },
      parts,
      text: partsToText(parts),
      ts: Number(tags['tmi-sent-ts']) || Date.now(),
    })
  }
}

function unescapeTag(v: string) {
  return v.replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\').replace(/\\r/g, '\r').replace(/\\n/g, '\n')
}

/** emotes tag: "25:0-4,12-16/1902:6-10" (indices are in code points). */
function parseEmotes(text: string, tag: string): ChatPart[] {
  if (!tag) return [{ t: 'text', v: text }]
  const chars = Array.from(text)
  const ranges: { start: number, end: number, id: string }[] = []
  for (const group of tag.split('/')) {
    const [id, pos] = group.split(':')
    for (const r of (pos ?? '').split(',')) {
      const [a, b] = r.split('-').map(Number)
      if (id && Number.isFinite(a) && Number.isFinite(b)) ranges.push({ start: a!, end: b!, id })
    }
  }
  ranges.sort((x, y) => x.start - y.start)
  const parts: ChatPart[] = []
  let i = 0
  for (const r of ranges) {
    if (r.start > i) parts.push({ t: 'text', v: chars.slice(i, r.start).join('') })
    parts.push({ t: 'emote', name: chars.slice(r.start, r.end + 1).join(''), url: `https://static-cdn.jtvnw.net/emoticons/v2/${r.id}/default/dark/2.0` })
    i = r.end + 1
  }
  if (i < chars.length) parts.push({ t: 'text', v: chars.slice(i).join('') })
  return parts
}
