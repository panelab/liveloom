import { z } from 'zod'
import { and, deviceCodes, eq } from '@sp/db'

const Body = z.object({ code: z.string(), approve: z.boolean() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = await parseBody(event, Body)
  const code = normalizeUserCode(body.code)
  if (!code) throw createError({ statusCode: 400, message: 'Enter the 8-letter code shown in OBS' })
  const db = useDb(event)
  const [row] = await db.select().from(deviceCodes).where(eq(deviceCodes.userCode, code)).limit(1)
  if (!row || row.expiresAt.getTime() < Date.now()) throw createError({ statusCode: 404, message: 'That code has expired. Start sign-in again in OBS.' })
  if (row.status !== 'pending') throw createError({ statusCode: 409, message: 'This code was already used.' })
  await db.update(deviceCodes)
    .set({ status: body.approve ? 'approved' : 'denied', userId: user.id })
    .where(and(eq(deviceCodes.userCode, code), eq(deviceCodes.status, 'pending')))
  return { ok: true }
})
