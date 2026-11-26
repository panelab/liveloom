import type { H3Event } from 'h3'

/**
 * Reads config on any runtime: Nuxt runtimeConfig (NUXT_*), then Cloudflare
 * bindings, then process.env (plain DATABASE_URL etc. shared with the relay).
 */
export function serverEnv(event: H3Event) {
  const rc = useRuntimeConfig(event)
  const cf = (event.context.cloudflare?.env ?? {}) as Record<string, string | undefined>
  const pick = (rcVal: string, name: string) => rcVal || cf[name] || process.env[name] || ''
  const env = {
    databaseUrl: pick(rc.databaseUrl, 'DATABASE_URL'),
    databaseAuthToken: pick(rc.databaseAuthToken, 'DATABASE_AUTH_TOKEN'),
    encryptionKey: pick(rc.encryptionKey, 'ENCRYPTION_KEY'),
  }
  if (!env.databaseUrl) throw createError({ statusCode: 500, message: 'DATABASE_URL is not configured' })
  if (!env.encryptionKey) throw createError({ statusCode: 500, message: 'ENCRYPTION_KEY is not configured' })
  return env
}
