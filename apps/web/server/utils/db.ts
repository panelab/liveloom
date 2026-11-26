import type { H3Event } from 'h3'
import { channels, createDb, eq, type Db } from '@sp/db'

let cached: { url: string, db: Db } | undefined

export function useDb(event: H3Event): Db {
  const { databaseUrl, databaseAuthToken } = serverEnv(event)
  if (cached?.url !== databaseUrl) {
    cached = { url: databaseUrl, db: createDb({ url: databaseUrl, authToken: databaseAuthToken }) }
  }
  return cached.db
}

/** The signed-in user's channel; 401 if not signed in. */
export async function requireChannel(event: H3Event) {
  const { user } = await requireUserSession(event)
  const db = useDb(event)
  const [channel] = await db.select().from(channels).where(eq(channels.userId, user.id)).limit(1)
  if (!channel) throw createError({ statusCode: 404, message: 'Channel not found' })
  return { user, channel, db }
}
