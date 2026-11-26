import { z } from 'zod'
import { deviceCodes, sql } from '@sp/db'

const Body = z.object({ client_name: z.string().trim().max(60).optional() }).optional()

/** OBS plugin asks for a sign-in code. No auth: the code is useless until a signed-in user approves it. */
export default defineEventHandler(async (event) => {
  const body = await parseBody(event, Body)
  const db = useDb(event)
  // Opportunistic cleanup of old codes.
  await db.delete(deviceCodes).where(sql`${deviceCodes.expiresAt} < ${Date.now() - 3600_000}`)

  const deviceCode = randomUrlToken(32)
  let userCode = newUserCode()
  for (let i = 0; i < 3; i++) {
    try {
      await db.insert(deviceCodes).values({
        deviceCodeHash: await sha256(deviceCode),
        userCode,
        clientName: body?.client_name ?? 'OBS',
        expiresAt: new Date(Date.now() + DEVICE_CODE_TTL_MS),
      })
      break
    } catch (e) {
      if (i === 2) throw e
      userCode = newUserCode()
    }
  }
  const site = siteUrl(event)
  return {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${site}/device`,
    verification_uri_complete: `${site}/device?code=${userCode}`,
    expires_in: DEVICE_CODE_TTL_MS / 1000,
    interval: DEVICE_POLL_INTERVAL_S,
  }
})
