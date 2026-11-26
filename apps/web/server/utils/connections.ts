import type { H3Event } from 'h3'
import { and, channels, connections, destinations, eq } from '@sp/db'
import { decryptSecret, encryptSecret, maskKey, normalizeServerUrl, PLATFORMS } from '@sp/shared'
import { PROVIDERS, refreshTokens, type ConnectPlatform, type PlatformAccount, type TokenSet } from './oauth'

/**
 * Saves the connection and makes LiveLoom ready to stream there: creates or
 * updates the destination (server + key) and fills the chat source if empty.
 */
export async function applyConnection(event: H3Event, userId: string, p: ConnectPlatform, tokens: TokenSet, account: PlatformAccount) {
  const db = useDb(event)
  const { encryptionKey } = serverEnv(event)
  const now = new Date()
  const values = {
    accountId: account.accountId,
    username: account.username,
    accessTokenEnc: await encryptSecret(tokens.accessToken, encryptionKey),
    refreshTokenEnc: tokens.refreshToken ? await encryptSecret(tokens.refreshToken, encryptionKey) : null,
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
    updatedAt: now,
  }
  const [conn] = await db.insert(connections).values({ userId, platform: p, ...values })
    .onConflictDoUpdate({ target: [connections.userId, connections.platform], set: values })
    .returning({ id: connections.id })

  const [channel] = await db.select().from(channels).where(eq(channels.userId, userId)).limit(1)
  if (!channel) throw createError({ statusCode: 404, message: 'Channel not found' })

  const dest = {
    serverUrl: normalizeServerUrl(account.serverUrl),
    streamKeyEnc: await encryptSecret(account.streamKey, encryptionKey),
    streamKeyHint: maskKey(account.streamKey),
    updatedAt: now,
  }
  // Reuse this connection's destination, else an existing one for the same platform.
  const [existing] = await db.select().from(destinations)
    .where(and(eq(destinations.channelId, channel.id), eq(destinations.platform, p)))
    .orderBy(destinations.createdAt)
  const linked = (await db.select().from(destinations).where(eq(destinations.connectionId, conn!.id)))[0] ?? existing
  if (linked) {
    await db.update(destinations).set({ ...dest, connectionId: conn!.id }).where(eq(destinations.id, linked.id))
  } else {
    await db.insert(destinations).values({ channelId: channel.id, platform: p, name: PLATFORMS[p].name, ...dest, connectionId: conn!.id })
  }

  const chatField = p === 'twitch' ? 'twitchLogin' : p === 'kick' ? 'kickSlug' : 'youtubeHandle'
  if (!channel[chatField]) {
    await db.update(channels).set({ [chatField]: p === 'youtube' ? account.chatTarget : account.chatTarget.toLowerCase() }).where(eq(channels.id, channel.id))
  }
}

/** Fresh access token for a stored connection (refreshing it if needed). */
export async function connectionToken(event: H3Event, userId: string, p: ConnectPlatform) {
  const db = useDb(event)
  const { encryptionKey } = serverEnv(event)
  const [c] = await db.select().from(connections).where(and(eq(connections.userId, userId), eq(connections.platform, p))).limit(1)
  if (!c) throw createError({ statusCode: 404, message: `${PROVIDERS[p].name} is not connected` })

  const fresh = !c.expiresAt || c.expiresAt.getTime() > Date.now() + 60_000
  if (fresh) return { tokens: null, accessToken: await decryptSecret(c.accessTokenEnc, encryptionKey) }
  if (!c.refreshTokenEnc) throw createError({ statusCode: 401, message: `${PROVIDERS[p].name} sign-in expired. Connect again.` })
  const tokens = await refreshTokens(event, p, await decryptSecret(c.refreshTokenEnc, encryptionKey))
  // Some providers (Kick, Twitch) rotate refresh tokens; Google may not return a new one.
  if (!tokens.refreshToken) tokens.refreshToken = await decryptSecret(c.refreshTokenEnc, encryptionKey)
  return { tokens, accessToken: tokens.accessToken }
}
