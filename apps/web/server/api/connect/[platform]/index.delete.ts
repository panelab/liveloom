import { and, connections, destinations, eq } from '@sp/db'

/** Forget the platform login. The destination stays (with its current key). */
export default defineEventHandler(async (event) => {
  const { user, db } = await requireChannel(event)
  const p = getRouterParam(event, 'platform')
  if (!isConnectPlatform(p)) throw createError({ statusCode: 404, message: 'Unknown platform' })
  const [c] = await db.delete(connections).where(and(eq(connections.userId, user.id), eq(connections.platform, p))).returning({ id: connections.id })
  if (c) await db.update(destinations).set({ connectionId: null }).where(eq(destinations.connectionId, c.id))
  return { ok: true }
})
