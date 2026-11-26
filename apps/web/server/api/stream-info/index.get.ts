import { applyStreamInfo, LIMITS, readStreamInfo, searchCategories, type StreamInfo } from '../../utils/streamInfo'
import { connections, eq } from '@sp/db'

export default defineEventHandler(async (event) => {
  const { user, channel, db } = await requireChannel(event)
  const conns = await db.select({ platform: connections.platform, scopes: connections.scopes, username: connections.username }).from(connections).where(eq(connections.userId, user.id))
  const need: Record<ConnectPlatform, string> = { twitch: 'channel:manage:broadcast', kick: 'channel:write', youtube: 'auth/youtube' }
  return {
    info: readStreamInfo(channel.streamInfo),
    limits: LIMITS,
    platforms: CONNECT_PLATFORMS.map((p) => {
      const c = conns.find((x) => x.platform === p)
      // Older connections were read-only; they must reconnect to allow updates.
      const scopes = c?.scopes ?? ''
      const canEdit = !!c && (!scopes || scopes.split(/[\s,]+/).some((s) => s.endsWith(need[p]) && !s.endsWith('.readonly')))
      return { platform: p, name: PROVIDERS[p].name, connected: !!c, username: c?.username ?? null, canEdit, available: !!oauthCredentials(event, p) }
    }),
  }
})
