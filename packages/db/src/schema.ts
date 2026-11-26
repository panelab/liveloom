import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID())
const now = (name: string) =>
  integer(name, { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`)

export const users = sqliteTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: now('created_at'),
})

/** One ingest point per user (MVP). OBS publishes to rtmp://host/live/<ingestKey>. */
export const channels = sqliteTable('channels', {
  id: id(),
  userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  ingestKey: text('ingest_key').notNull().unique(),
  isLive: integer('is_live', { mode: 'boolean' }).notNull().default(false),
  /** Secret the OBS plugin / overlay uses to read the merged chat feed. */
  chatToken: text('chat_token').unique(),
  /** Chat sources (read-only, no login needed). */
  twitchLogin: text('twitch_login'),
  kickSlug: text('kick_slug'),
  youtubeHandle: text('youtube_handle'),
  /** Latest ingest analysis from the relay (JSON, see @sp/shared IngestHealth). */
  ingestHealth: text('ingest_health'),
  liveSince: integer('live_since', { mode: 'timestamp_ms' }),
  updatedAt: now('updated_at'),
})

export const destinations = sqliteTable('destinations', {
  id: id(),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  name: text('name').notNull(),
  serverUrl: text('server_url').notNull(),
  /** AES-GCM encrypted, see @sp/shared crypto */
  streamKeyEnc: text('stream_key_enc').notNull(),
  /** Masked key for display, e.g. "live…9f2a" */
  streamKeyHint: text('stream_key_hint').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  /** Set when the destination was created by "Connect with …" (OAuth). */
  connectionId: text('connection_id'),
  createdAt: now('created_at'),
  /** Bumped on any change; relay restarts the push when it moves. */
  updatedAt: now('updated_at'),
}, (t) => [index('destinations_channel_idx').on(t.channelId)])

/** Written by the relay, read by the dashboard. */
export const destinationStatus = sqliteTable('destination_status', {
  destinationId: text('destination_id').primaryKey().references(() => destinations.id, { onDelete: 'cascade' }),
  state: text('state', { enum: ['idle', 'connecting', 'live', 'retrying', 'error'] }).notNull(),
  message: text('message'),
  bitrateKbps: integer('bitrate_kbps'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  updatedAt: now('updated_at'),
})

/** A platform account linked with OAuth ("Connect with YouTube/Twitch/Kick"). */
export const connections = sqliteTable('connections', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  /** Platform's account/channel ID */
  accountId: text('account_id').notNull(),
  /** Display name, e.g. "@cybnischal" or "shroud" */
  username: text('username').notNull(),
  /** Encrypted with ENCRYPTION_KEY */
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc'),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  scopes: text('scopes'),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [uniqueIndex('connections_user_platform_idx').on(t.userId, t.platform)])

/** OBS plugin sign-in (OAuth device flow style). */
export const deviceCodes = sqliteTable('device_codes', {
  /** SHA-256 of the secret device code the plugin polls with */
  deviceCodeHash: text('device_code_hash').primaryKey(),
  /** Short code the user types/approves, e.g. "WDJB-MJHT" */
  userCode: text('user_code').notNull().unique(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'approved', 'consumed', 'denied'] }).notNull().default('pending'),
  clientName: text('client_name'),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: now('created_at'),
})
