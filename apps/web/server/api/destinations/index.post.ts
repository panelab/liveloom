import { z } from 'zod'
import { destinations } from '@sp/db'
import { encryptSecret, maskKey } from '@sp/shared'

const Body = z.object({
  platform: z.enum(platformIds),
  name: z.string().trim().min(1).max(60),
  serverUrl: serverUrlSchema,
  streamKey: streamKeySchema,
})

export default defineEventHandler(async (event) => {
  const { channel, db } = await requireChannel(event)
  const body = await parseBody(event, Body)
  const [row] = await db.insert(destinations).values({
    channelId: channel.id,
    platform: body.platform,
    name: body.name,
    serverUrl: body.serverUrl,
    streamKeyEnc: await encryptSecret(body.streamKey, serverEnv(event).encryptionKey),
    streamKeyHint: maskKey(body.streamKey),
  }).returning({ id: destinations.id })
  return { id: row!.id }
})
