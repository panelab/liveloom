import { deviceCodes, eq } from '@sp/db'

/** What the /device page shows before the user approves. */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const code = normalizeUserCode(String(getQuery(event).code ?? ''))
  if (!code) throw createError({ statusCode: 400, message: 'Enter the 8-letter code shown in OBS' })
  const [row] = await useDb(event).select().from(deviceCodes).where(eq(deviceCodes.userCode, code)).limit(1)
  if (!row || row.expiresAt.getTime() < Date.now()) throw createError({ statusCode: 404, message: 'That code has expired or does not exist. Start sign-in again in OBS.' })
  return { userCode: row.userCode, clientName: row.clientName, status: row.status }
})
