import { connections, eq } from '@sp/db'

/** Which platforms can be connected (app credentials configured) and which are. */
export default defineEventHandler(async (event) => {
  const { user, db } = await requireChannel(event)
  const rows = await db.select().from(connections).where(eq(connections.userId, user.id))
  return CONNECT_PLATFORMS.map((p) => {
    const c = rows.find((r) => r.platform === p)
    return {
      platform: p,
      name: PROVIDERS[p].name,
      available: !!oauthCredentials(event, p),
      connected: !!c,
      username: c?.username ?? null,
      connectedAt: c?.createdAt.getTime() ?? null,
    }
  })
})
