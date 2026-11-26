import { z } from 'zod'
import { and, destinations, eq } from '@sp/db'
import { encryptSecret, maskKey } from '@sp/shared'

const Body = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  serverUrl: serverUrlSchema.optional(),
  /** Omit or empty = keep the current key */
  streamKey: z.union([streamKeySchema, z.literal('')]).optional(),
  enabled: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const { channel, db } = await requireChannel(event)
  const id = getRouterParam(event, 'id')!
  const body = await parseBody(event, Body)

  const set: Partial<typeof destinations.$inferInsert> = { updatedAt: new Date() }
  if (body.name !== undefined) set.name = body.name
  if (body.serverUrl !== undefined) set.serverUrl = body.serverUrl
  if (body.enabled !== undefined) set.enabled = body.enabled
  if (body.streamKey) {
    set.streamKeyEnc = await encryptSecret(body.streamKey, serverEnv(event).encryptionKey)
    set.streamKeyHint = maskKey(body.streamKey)
  }
  const res = await db.update(destinations).set(set)
    .where(and(eq(destinations.id, id), eq(destinations.channelId, channel.id)))
    .returning({ id: destinations.id })
  if (!res.length) throw createError({ statusCode: 404, message: 'Destination not found' })
  return { ok: true }
})
