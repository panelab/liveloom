import { z } from 'zod'
import { eq, users } from '@sp/db'

const Body = z.object({ email: z.string().transform((e) => e.toLowerCase().trim()), password: z.string() })

export default defineEventHandler(async (event) => {
  const { email, password } = await parseBody(event, Body)
  const [user] = await useDb(event).select().from(users).where(eq(users.email, email)).limit(1)
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw createError({ statusCode: 401, message: 'Wrong email or password' })
  }
  await setUserSession(event, { user: { id: user.id, email: user.email } })
  return { ok: true }
})
