import { channels, eq } from '@sp/db'
import { randomToken } from '@sp/shared'

export default defineEventHandler(async (event) => {
  const { channel, db } = await requireChannel(event)
  if (channel.isLive) throw createError({ statusCode: 409, message: 'Stop streaming before resetting your key' })
  const ingestKey = randomToken()
  await db.update(channels).set({ ingestKey, updatedAt: new Date() }).where(eq(channels.id, channel.id))
  return { ingestKey }
})
