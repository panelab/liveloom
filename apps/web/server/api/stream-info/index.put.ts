import { applyStreamInfo, LIMITS, readStreamInfo, searchCategories, type StreamInfo } from '../../utils/streamInfo'
import { z } from 'zod'
import { channels, eq } from '@sp/db'

const Cat = z.object({ id: z.string().min(1).max(64), name: z.string().max(200), image: z.string().max(500).optional() }).nullable().optional()
const Body = z.object({
  title: z.string().trim().max(LIMITS.title, `Title can be at most ${LIMITS.title} characters`),
  description: z.string().max(LIMITS.description, `Description can be at most ${LIMITS.description} characters`),
  tags: z.array(z.string().trim().min(1).max(25, 'Tags can be at most 25 characters')).max(LIMITS.tags, `At most ${LIMITS.tags} tags`),
  categories: z.object({ twitch: Cat, kick: Cat, youtube: Cat }).default({}),
  /** Also push to connected platforms now */
  apply: z.boolean().default(false),
})

export default defineEventHandler(async (event) => {
  const { user, channel, db } = await requireChannel(event)
  const body = await parseBody(event, Body)
  const prev = readStreamInfo(channel.streamInfo)
  const info: StreamInfo = { title: body.title, description: body.description, tags: body.tags, categories: body.categories, applied: prev.applied }
  await db.update(channels).set({ streamInfo: JSON.stringify(info) }).where(eq(channels.id, channel.id))
  const applied = body.apply ? await applyStreamInfo(event, user.id, channel.id, info) : info.applied
  return { info: { ...info, applied } }
})
