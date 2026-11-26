import { z } from 'zod'
import { channels, eq, users } from '@sp/db'
import { randomToken } from '@sp/shared'

const Body = z.object({
  email: z.email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, Body.parse)
  const db = useDb(event)
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing) throw createError({ statusCode: 409, message: 'An account with this email already exists' })

  const [user] = await db.insert(users).values({ email, passwordHash: await hashPassword(password) }).returning()
  await db.insert(channels).values({ userId: user!.id, ingestKey: randomToken() })
  await setUserSession(event, { user: { id: user!.id, email } })
  return { ok: true }
})
