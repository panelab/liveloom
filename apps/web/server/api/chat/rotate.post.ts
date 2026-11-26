import { channels, eq } from '@sp/db'
import { randomToken } from '@sp/shared'

export default defineEventHandler(async (event) => {
  const { channel, db } = await requireChannel(event)
  const token = randomToken(24)
  await db.update(channels).set({ chatToken: token }).where(eq(channels.id, channel.id))
  return { token }
})
