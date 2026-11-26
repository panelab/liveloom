import { createClient } from '@libsql/client/web'
import { drizzle } from 'drizzle-orm/libsql/web'
import * as schema from './schema'

export * from './schema'
export { schema }
export { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

export interface DbConfig {
  url: string
  authToken?: string
}

/**
 * HTTP-based libSQL client: works against Turso cloud, `turso dev`, or a
 * self-hosted sqld, from Bun, Node and Cloudflare Workers alike.
 */
export function createDb({ url, authToken }: DbConfig) {
  const client = createClient({ url, authToken: authToken || undefined })
  return drizzle(client, { schema })
}

export type Db = ReturnType<typeof createDb>
