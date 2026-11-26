import { and, destinations, eq } from '@sp/db'

export default defineEventHandler(async (event) => {
  const { channel, db } = await requireChannel(event)
  const id = getRouterParam(event, 'id')!
  const res = await db.delete(destinations)
    .where(and(eq(destinations.id, id), eq(destinations.channelId, channel.id)))
    .returning({ id: destinations.id })
  if (!res.length) throw createError({ statusCode: 404, message: 'Destination not found' })
  return { ok: true }
})
