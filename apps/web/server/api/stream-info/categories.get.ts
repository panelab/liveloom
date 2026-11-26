import { applyStreamInfo, LIMITS, readStreamInfo, searchCategories, type StreamInfo } from '../../utils/streamInfo'
export default defineEventHandler(async (event) => {
  const { user } = await requireChannel(event)
  const q = getQuery(event)
  const p = String(q.platform ?? '')
  if (!isConnectPlatform(p)) throw createError({ statusCode: 400, message: 'Unknown platform' })
  try {
    return await searchCategories(event, user.id, p, String(q.q ?? '').slice(0, 100))
  } catch (e) {
    throw createError({ statusCode: 502, message: e instanceof Error ? e.message : 'Search failed' })
  }
})
