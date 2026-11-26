import type { H3Event } from 'h3'
import type { z } from 'zod'

/** Reads and validates a JSON body; on failure throws 400 with the first readable message. */
export async function parseBody<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.infer<T>> {
  const result = schema.safeParse(await readBody(event).catch(() => undefined))
  if (!result.success) {
    const issue = result.error.issues[0]
    throw createError({ statusCode: 400, message: issue?.message ?? 'Invalid request' })
  }
  return result.data
}
