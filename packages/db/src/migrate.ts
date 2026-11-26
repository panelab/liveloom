import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createDb } from './index'

export async function runMigrations(url: string, authToken?: string) {
  const db = createDb({ url, authToken })
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  await runMigrations(url, process.env.DATABASE_AUTH_TOKEN)
  console.log('✓ migrations applied')
}
