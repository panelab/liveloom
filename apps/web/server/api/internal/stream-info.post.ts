import { channels, eq } from '@sp/db'
import { applyStreamInfo, readStreamInfo } from '../../utils/streamInfo'

/**
 * Called by the relay when a channel goes live (and again a bit later), so the
 * saved title/description reach platforms even if nobody has the dashboard open.
 * YouTube only creates the live video after the stream starts, hence the retry.
 */
export default defineEventHandler(async (event) => {
  const secret = process.env.RELAY_SECRET
  if (!secret || getHeader(event, 'x-relay-secret') !== secret) throw createError({ statusCode: 401, message: 'Unauthorized' })
  const { channelId } = await readBody<{ channelId?: string }>(event)
  if (!channelId) throw createError({ statusCode: 400, message: 'channelId required' })
  const db = useDb(event)
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1)
  if (!channel) throw createError({ statusCode: 404, message: 'Channel not found' })
  const info = readStreamInfo(channel.streamInfo)
  if (!info.title && !info.description && !info.tags.length && !Object.values(info.categories).some(Boolean)) return { skipped: true }
  return { applied: await applyStreamInfo(event, channel.userId, channel.id, info) }
})
