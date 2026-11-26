import { partsToText, type ChatMessage, type ChatPart } from '@sp/shared'
import { BROWSER_UA, ChatSource, OfflineError } from './source'

/**
 * YouTube live chat without an API key or quota: the same endpoint youtube.com's
 * chat window polls. Target can be a handle (@name), a channel ID (UC…), or a
 * video URL/ID.
 */
export class YouTubeSource extends ChatSource {
  readonly platform = 'youtube'
  private abort: AbortController | null = null

  protected async connect() {
    this.abort = new AbortController()
    const signal = this.abort.signal
    let { continuation, clientVersion } = await this.findLiveChat(signal)
    this.connected()
    let first = true
    const seen = new Set<string>()

    while (!this.stopped) {
      const res = await fetch('https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?prettyPrint=false', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': BROWSER_UA },
        body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion } }, continuation }),
        signal,
      })
      if (!res.ok) throw new Error(`YouTube chat ${res.status}`)
      const body = (await res.json()) as any
      const lc = body?.continuationContents?.liveChatContinuation
      if (!lc) throw new OfflineError('Live stream ended')

      // The first response is the recent backlog; skip it so only live messages show.
      for (const a of lc.actions ?? []) {
        const msg = parseAction(a)
        if (!msg || seen.has(msg.id)) continue
        seen.add(msg.id)
        if (!first) this.events.onMessage(msg)
      }
      if (seen.size > 2000) seen.clear()
      first = false

      const next = lc.continuations?.[0]
      const data = next?.invalidationContinuationData ?? next?.timedContinuationData ?? next?.reloadContinuationData
      if (!data?.continuation) throw new OfflineError('Live stream ended')
      continuation = data.continuation
      const wait = Math.max(1500, Math.min(Number(data.timeoutMs) || 3000, 4000))
      await Bun.sleep(wait)
    }
  }

  protected close() {
    this.abort?.abort()
    this.abort = null
  }

  private async findLiveChat(signal: AbortSignal) {
    const t = this.target.trim()
    const videoId = /(?:v=|youtu\.be\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(t)?.[1] ?? (/^[A-Za-z0-9_-]{11}$/.test(t) ? t : null)
    const url = videoId
      ? `https://www.youtube.com/live_chat?is_popout=1&v=${videoId}`
      : /^UC[A-Za-z0-9_-]{22}$/.test(t)
        ? `https://www.youtube.com/channel/${t}/live`
        : `https://www.youtube.com/${t.startsWith('@') ? t : '@' + t.replace(/^https?:\/\/(www\.)?youtube\.com\//, '')}/live`

    const res = await fetch(url, {
      headers: { 'user-agent': BROWSER_UA, 'accept-language': 'en-US,en', cookie: 'CONSENT=YES+1; SOCS=CAI' },
      signal,
    })
    if (res.status === 404) throw new Error('YouTube channel not found')
    const html = await res.text()
    const clientVersion = /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1] ?? '2.20261125.00.00'
    const block = /"liveChatRenderer":\{"continuations":\[\{"\w+ContinuationData":\{[^}]*?"continuation":"([^"]+)"/.exec(html)
    if (!block) throw new OfflineError('Not live right now')
    return { continuation: block[1]!, clientVersion }
  }
}

function runsToParts(runs: any[] = []): ChatPart[] {
  const parts: ChatPart[] = []
  for (const r of runs) {
    if (r.text != null) parts.push({ t: 'text', v: r.text })
    else if (r.emoji) {
      const e = r.emoji
      const thumbs = e.image?.thumbnails ?? []
      const url = thumbs[thumbs.length - 1]?.url
      if (!e.isCustomEmoji && e.emojiId && !/^UC/.test(e.emojiId)) parts.push({ t: 'text', v: e.emojiId })
      else if (url) parts.push({ t: 'emote', name: e.shortcuts?.[0] ?? e.searchTerms?.[0] ?? '', url })
    }
  }
  return parts
}

function parseAction(a: any): ChatMessage | null {
  const item = a?.addChatItemAction?.item
  const r = item?.liveChatTextMessageRenderer ?? item?.liveChatPaidMessageRenderer
  if (!r?.id) return null
  const parts = runsToParts(r.message?.runs)
  const badges: string[] = []
  for (const b of r.authorBadges ?? []) {
    const icon = b.liveChatAuthorBadgeRenderer?.icon?.iconType as string | undefined
    if (icon === 'OWNER') badges.push('broadcaster')
    else if (icon === 'MODERATOR') badges.push('moderator')
    else if (icon === 'VERIFIED') badges.push('verified')
    else if (b.liveChatAuthorBadgeRenderer?.customThumbnail) badges.push('member')
  }
  return {
    id: `yt:${r.id}`,
    platform: 'youtube',
    author: { name: r.authorName?.simpleText ?? 'unknown', badges },
    parts,
    text: partsToText(parts),
    amount: r.purchaseAmountText?.simpleText,
    ts: Math.floor(Number(r.timestampUsec) / 1000) || Date.now(),
  }
}
