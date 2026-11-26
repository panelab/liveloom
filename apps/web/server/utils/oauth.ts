import type { H3Event } from 'h3'

export type ConnectPlatform = 'youtube' | 'twitch' | 'kick'
export const CONNECT_PLATFORMS: ConnectPlatform[] = ['youtube', 'twitch', 'kick']

export interface TokenSet {
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  scopes: string | null
}

/** What a platform tells us after "Connect": enough to stream and read chat. */
export interface PlatformAccount {
  accountId: string
  username: string
  /** Value for the chat source (Twitch login, Kick slug, YouTube @handle) */
  chatTarget: string
  serverUrl: string
  streamKey: string
}

interface Provider {
  name: string
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
  pkce: boolean
  extraAuthParams?: Record<string, string>
  fetchAccount(token: string, clientId: string): Promise<PlatformAccount>
}

export class ConnectError extends Error {}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json', ...headers } })
  const body = await res.text()
  if (!res.ok) throw new ConnectError(`${new URL(url).host} ${res.status}: ${body.slice(0, 200)}`)
  return JSON.parse(body) as T
}

export const PROVIDERS: Record<ConnectPlatform, Provider> = {
  twitch: {
    name: 'Twitch',
    authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
    scopes: ['channel:read:stream_key'],
    pkce: false,
    async fetchAccount(token, clientId) {
      const h = { authorization: `Bearer ${token}`, 'client-id': clientId }
      const users = await getJson<{ data: { id: string, login: string, display_name: string }[] }>('https://api.twitch.tv/helix/users', h)
      const u = users.data[0]
      if (!u) throw new ConnectError('Twitch did not return your account')
      const key = await getJson<{ data: { stream_key: string }[] }>(`https://api.twitch.tv/helix/streams/key?broadcaster_id=${u.id}`, h)
      const streamKey = key.data[0]?.stream_key
      if (!streamKey) throw new ConnectError('Twitch did not return a stream key')
      return { accountId: u.id, username: u.display_name || u.login, chatTarget: u.login, serverUrl: 'rtmp://live.twitch.tv/app', streamKey }
    },
  },

  kick: {
    name: 'Kick',
    authorizeUrl: 'https://id.kick.com/oauth/authorize',
    tokenUrl: 'https://id.kick.com/oauth/token',
    scopes: ['user:read', 'channel:read', 'streamkey:read'],
    pkce: true,
    async fetchAccount(token) {
      const h = { authorization: `Bearer ${token}` }
      const ch = await getJson<{ data: { broadcaster_user_id: number, slug: string, stream?: { url?: string, key?: string } }[] }>('https://api.kick.com/public/v1/channels', h)
      const c = ch.data[0]
      if (!c) throw new ConnectError('Kick did not return your channel')
      if (!c.stream?.url || !c.stream?.key) throw new ConnectError('Kick did not return a stream key. Make sure the app has the "streamkey:read" scope.')
      return { accountId: String(c.broadcaster_user_id), username: c.slug, chatTarget: c.slug, serverUrl: c.stream.url, streamKey: c.stream.key }
    },
  },

  youtube: {
    name: 'YouTube',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    pkce: true,
    extraAuthParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    async fetchAccount(token) {
      const h = { authorization: `Bearer ${token}` }
      const ch = await getJson<{ items?: { id: string, snippet: { title: string, customUrl?: string } }[] }>(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', h)
      const c = ch.items?.[0]
      if (!c) throw new ConnectError('This Google account has no YouTube channel')
      const streams = await getJson<{ items?: { snippet: { title: string, isDefaultStream?: boolean }, cdn: { ingestionInfo: { ingestionAddress: string, streamName: string } } }[] }>(
        'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn&mine=true&maxResults=50', h)
      const items = streams.items ?? []
      const s = items.find((i) => i.snippet.isDefaultStream) ?? items.find((i) => /default/i.test(i.snippet.title)) ?? items[0]
      if (!s) throw new ConnectError('YouTube has no stream key for this channel yet. Open YouTube Studio → Go live once to enable live streaming, then connect again.')
      const handle = c.snippet.customUrl ? (c.snippet.customUrl.startsWith('@') ? c.snippet.customUrl : `@${c.snippet.customUrl}`) : c.id
      return {
        accountId: c.id,
        username: c.snippet.customUrl ? handle : c.snippet.title,
        chatTarget: handle,
        serverUrl: s.cdn.ingestionInfo.ingestionAddress,
        streamKey: s.cdn.ingestionInfo.streamName,
      }
    },
  },
}

export function oauthCredentials(event: H3Event, p: ConnectPlatform) {
  const o = useRuntimeConfig(event).connect[p]
  return o?.clientId && o?.clientSecret ? o : null
}

export function siteUrl(event: H3Event) {
  return (useRuntimeConfig(event).public.siteUrl as string) || getRequestURL(event).origin
}

export function redirectUri(event: H3Event, p: ConnectPlatform) {
  return `${siteUrl(event)}/api/connect/${p}/callback`
}

function b64url(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomUrlToken(n = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(n)))
}

export async function pkceChallenge(verifier: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

async function tokenRequest(p: ConnectPlatform, params: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(PROVIDERS[p].tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(params),
  })
  const body = await res.json().catch(() => ({})) as Record<string, any>
  if (!res.ok || !body.access_token) {
    throw new ConnectError(`${PROVIDERS[p].name} sign-in failed: ${body.error_description ?? body.message ?? body.error ?? res.status}`)
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: body.expires_in ? new Date(Date.now() + Number(body.expires_in) * 1000) : null,
    scopes: Array.isArray(body.scope) ? body.scope.join(' ') : (body.scope ?? null),
  }
}

export function exchangeCode(event: H3Event, p: ConnectPlatform, code: string, verifier: string | undefined) {
  const cred = oauthCredentials(event, p)!
  return tokenRequest(p, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(event, p),
    client_id: cred.clientId,
    client_secret: cred.clientSecret,
    ...(PROVIDERS[p].pkce && verifier ? { code_verifier: verifier } : {}),
  })
}

export function refreshTokens(event: H3Event, p: ConnectPlatform, refreshToken: string) {
  const cred = oauthCredentials(event, p)!
  return tokenRequest(p, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: cred.clientId, client_secret: cred.clientSecret })
}

export function isConnectPlatform(p: unknown): p is ConnectPlatform {
  return typeof p === 'string' && (CONNECT_PLATFORMS as string[]).includes(p)
}
