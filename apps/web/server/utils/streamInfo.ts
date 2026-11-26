import type { H3Event } from 'h3'
import { and, channels, connections, eq } from '@sp/db'
import { decryptSecret, encryptSecret } from '@sp/shared'

/**
 * Stream details (title, description, tags, category) written once in
 * LiveLoom and pushed to every connected platform:
 *   Twitch  PATCH helix/channels              (channel:manage:broadcast)
 *   Kick    PATCH public/v1/channels          (channel:write)
 *   YouTube videos.update on the live/next broadcast (youtube)
 */
export interface Category { id: string, name: string, image?: string }
export interface ApplyResult { ok: boolean, message: string, at: number }
export interface StreamInfo {
  title: string
  description: string
  tags: string[]
  categories: Partial<Record<ConnectPlatform, Category | null>>
  applied: Partial<Record<ConnectPlatform, ApplyResult>>
}

export const LIMITS = { title: 140, description: 5000, tags: 10 }

export function readStreamInfo(raw: string | null | undefined): StreamInfo {
  const empty: StreamInfo = { title: '', description: '', tags: [], categories: {}, applied: {} }
  if (!raw) return empty
  try {
    return { ...empty, ...JSON.parse(raw) }
  } catch {
    return empty
  }
}

/** Access token for a connection; refreshes and saves new tokens when expired. */
export async function accessTokenFor(event: H3Event, userId: string, p: ConnectPlatform): Promise<{ token: string, accountId: string, clientId: string }> {
  const db = useDb(event)
  const { encryptionKey } = serverEnv(event)
  const cred = oauthCredentials(event, p)
  if (!cred) throw new ConnectError(`${PROVIDERS[p].name} connect isn’t set up on this server`)
  const [c] = await db.select().from(connections).where(and(eq(connections.userId, userId), eq(connections.platform, p))).limit(1)
  if (!c) throw new ConnectError(`${PROVIDERS[p].name} isn’t connected`)
  if (!c.expiresAt || c.expiresAt.getTime() > Date.now() + 60_000) {
    return { token: await decryptSecret(c.accessTokenEnc, encryptionKey), accountId: c.accountId, clientId: cred.clientId }
  }
  if (!c.refreshTokenEnc) throw new ConnectError(`${PROVIDERS[p].name} sign-in expired. Reconnect it in Settings.`)
  const t = await refreshTokens(event, p, await decryptSecret(c.refreshTokenEnc, encryptionKey))
  await db.update(connections).set({
    accessTokenEnc: await encryptSecret(t.accessToken, encryptionKey),
    ...(t.refreshToken ? { refreshTokenEnc: await encryptSecret(t.refreshToken, encryptionKey) } : {}),
    expiresAt: t.expiresAt,
    updatedAt: new Date(),
  }).where(eq(connections.id, c.id))
  return { token: t.accessToken, accountId: c.accountId, clientId: cred.clientId }
}

async function call(p: ConnectPlatform, url: string, init: RequestInit & { headers: Record<string, string> }) {
  const res = await fetch(url, { ...init, headers: { accept: 'application/json', ...init.headers } })
  const text = await res.text()
  if (res.status === 401 || res.status === 403) {
    throw new ConnectError(`${PROVIDERS[p].name} didn’t allow this. Reconnect ${PROVIDERS[p].name} in Settings so LiveLoom can update your stream details.`)
  }
  if (!res.ok) {
    let msg = text.slice(0, 200)
    try {
      const j = JSON.parse(text)
      msg = j.message ?? j.error?.message ?? j.error_description ?? msg
    } catch {}
    throw new ConnectError(`${PROVIDERS[p].name}: ${msg}`)
  }
  return text ? JSON.parse(text) : null
}

/** Twitch tags: letters and numbers only, ≤25 chars, ≤10 tags. */
const twitchTags = (tags: string[]) => tags.map((t) => t.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 25)).filter(Boolean).slice(0, 10)

const APPLY: Record<ConnectPlatform, (a: { token: string, accountId: string, clientId: string }, info: StreamInfo) => Promise<string>> = {
  async twitch({ token, accountId, clientId }, info) {
    const body: Record<string, unknown> = { title: info.title.slice(0, 140), tags: twitchTags(info.tags) }
    if (info.categories.twitch) body.game_id = info.categories.twitch.id
    await call('twitch', `https://api.twitch.tv/helix/channels?broadcaster_id=${accountId}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'client-id': clientId, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return 'Updated'
  },

  async kick({ token }, info) {
    const body: Record<string, unknown> = { stream_title: info.title.slice(0, 140), custom_tags: info.tags.slice(0, 10) }
    if (info.categories.kick) body.category_id = Number(info.categories.kick.id)
    await call('kick', 'https://api.kick.com/public/v1/channels', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return 'Updated'
  },

  async youtube({ token }, info) {
    const h = { authorization: `Bearer ${token}` }
    type B = { id: string, snippet: { title: string, isDefaultBroadcast?: boolean, scheduledStartTime?: string }, status: { lifeCycleStatus: string } }
    const list = await call('youtube', 'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,status&mine=true&broadcastType=all&maxResults=50', { headers: h }) as { items?: B[] }
    const items = list.items ?? []
    // Live now → the one YouTube made for this stream → the next scheduled one.
    const b = items.find((i) => ['live', 'liveStarting', 'testing', 'testStarting'].includes(i.status.lifeCycleStatus))
      ?? items.find((i) => i.snippet.isDefaultBroadcast && i.status.lifeCycleStatus !== 'complete')
      ?? items.filter((i) => ['ready', 'created'].includes(i.status.lifeCycleStatus))
        .sort((a, c) => (a.snippet.scheduledStartTime ?? '').localeCompare(c.snippet.scheduledStartTime ?? ''))[0]
    if (!b) return 'Saved. YouTube creates your live video when you start streaming; LiveLoom sets the title then.'
    const v = await call('youtube', `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${b.id}`, { headers: h }) as { items?: { snippet: { categoryId: string, title: string, description?: string, tags?: string[] } }[] }
    const current = v.items?.[0]?.snippet
    if (!current) throw new ConnectError('YouTube: couldn’t read the live video')
    await call('youtube', 'https://www.googleapis.com/youtube/v3/videos?part=snippet', {
      method: 'PUT',
      headers: { ...h, 'content-type': 'application/json' },
      body: JSON.stringify({
        id: b.id,
        snippet: {
          title: (info.title || current.title).slice(0, 100),
          description: info.description.slice(0, 5000),
          tags: info.tags.length ? info.tags : current.tags,
          categoryId: info.categories.youtube?.id ?? current.categoryId,
        },
      }),
    })
    return 'Updated'
  },
}

/** Push stream details to every connected platform (or a subset) and remember the outcome. */
export async function applyStreamInfo(event: H3Event, userId: string, channelId: string, info: StreamInfo, only?: ConnectPlatform[]) {
  const db = useDb(event)
  const conns = await db.select({ platform: connections.platform }).from(connections).where(eq(connections.userId, userId))
  const targets = conns.map((c) => c.platform as ConnectPlatform).filter((p) => CONNECT_PLATFORMS.includes(p) && (!only || only.includes(p)))
  const results = await Promise.all(targets.map(async (p) => {
    try {
      const auth = await accessTokenFor(event, userId, p)
      return [p, { ok: true, message: await APPLY[p](auth, info), at: Date.now() }] as const
    } catch (e) {
      console.warn(`[stream-info:${p}]`, e instanceof Error ? e.message : e)
      return [p, { ok: false, message: e instanceof ConnectError ? e.message : `Couldn’t update ${PROVIDERS[p].name}`, at: Date.now() }] as const
    }
  }))
  info.applied = { ...info.applied, ...Object.fromEntries(results) }
  await db.update(channels).set({ streamInfo: JSON.stringify(info) }).where(eq(channels.id, channelId))
  return info.applied
}

/** Category search per platform. */
export async function searchCategories(event: H3Event, userId: string, p: ConnectPlatform, q: string): Promise<Category[]> {
  const auth = await accessTokenFor(event, userId, p)
  if (p === 'twitch') {
    if (!q.trim()) return []
    const r = await call('twitch', `https://api.twitch.tv/helix/search/categories?first=12&query=${encodeURIComponent(q)}`, {
      headers: { authorization: `Bearer ${auth.token}`, 'client-id': auth.clientId },
    }) as { data: { id: string, name: string, box_art_url: string }[] }
    return r.data.map((c) => ({ id: c.id, name: c.name, image: c.box_art_url.replace('{width}', '52').replace('{height}', '72') }))
  }
  if (p === 'kick') {
    if (!q.trim()) return []
    const h = { authorization: `Bearer ${auth.token}` }
    type K = { data: { id: number, name: string, thumbnail?: string }[] }
    const r = await call('kick', `https://api.kick.com/public/v2/categories?name=${encodeURIComponent(q)}&limit=12`, { headers: h })
      .catch(() => call('kick', `https://api.kick.com/public/v1/categories?q=${encodeURIComponent(q)}`, { headers: h })) as K
    return (r.data ?? []).slice(0, 12).map((c) => ({ id: String(c.id), name: c.name, image: c.thumbnail }))
  }
  const r = await call('youtube', 'https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=US', {
    headers: { authorization: `Bearer ${auth.token}` },
  }) as { items: { id: string, snippet: { title: string, assignable: boolean } }[] }
  const needle = q.trim().toLowerCase()
  return r.items.filter((c) => c.snippet.assignable && (!needle || c.snippet.title.toLowerCase().includes(needle))).map((c) => ({ id: c.id, name: c.snippet.title }))
}
