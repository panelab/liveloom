import { z } from 'zod'
import { and, channels, deviceCodes, eq, users } from '@sp/db'
import { randomToken } from '@sp/shared'

const Body = z.object({ device_code: z.string().min(20).max(200) })

/**
 * The plugin polls this. Errors follow RFC 8628 names so clients can branch:
 * authorization_pending, access_denied, expired_token.
 */
export default defineEventHandler(async (event) => {
  const body = await parseBody(event, Body)
  const db = useDb(event)
  const hash = await sha256(body.device_code)
  const [row] = await db.select().from(deviceCodes).where(eq(deviceCodes.deviceCodeHash, hash)).limit(1)

  const fail = (error: string, message: string) => {
    setResponseStatus(event, 400)
    return { error, message }
  }
  if (!row || row.expiresAt.getTime() < Date.now() || row.status === 'consumed') return fail('expired_token', 'Sign-in code expired. Try again.')
  if (row.status === 'denied') return fail('access_denied', 'Sign-in was denied.')
  if (row.status !== 'approved' || !row.userId) return fail('authorization_pending', 'Waiting for approval…')

  // One-time use.
  const claimed = await db.update(deviceCodes).set({ status: 'consumed' })
    .where(and(eq(deviceCodes.deviceCodeHash, hash), eq(deviceCodes.status, 'approved'))).returning({ userId: deviceCodes.userId })
  if (!claimed.length) return fail('expired_token', 'Sign-in code already used.')

  const [channel] = await db.select().from(channels).where(eq(channels.userId, row.userId)).limit(1)
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1)
  if (!channel || !user) return fail('expired_token', 'Account not found.')
  let chatToken = channel.chatToken
  if (!chatToken) {
    chatToken = randomToken(24)
    await db.update(channels).set({ chatToken }).where(eq(channels.id, channel.id))
  }
  return {
    account: user.email,
    server: siteUrl(event),
    chat_token: chatToken,
    ingest_url: useRuntimeConfig(event).public.ingestUrl,
    ingest_key: channel.ingestKey,
  }
})
