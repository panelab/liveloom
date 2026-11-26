function req(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set (see .env.example)`)
  return v
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
  databaseUrl: req('DATABASE_URL'),
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  encryptionKey: req('ENCRYPTION_KEY'),
  relaySecret: req('RELAY_SECRET'),
  mediamtxApi: (process.env.MEDIAMTX_API_URL ?? 'http://127.0.0.1:9997').replace(/\/$/, ''),
  mediamtxRtmp: (process.env.MEDIAMTX_RTMP_URL ?? 'rtmp://127.0.0.1:1935').replace(/\/$/, ''),
  mediamtxRtsp: (process.env.MEDIAMTX_RTSP_URL ?? 'rtsp://127.0.0.1:8554').replace(/\/$/, ''),
  /** Web app, for pushing saved stream titles when a channel goes live (dev: Nuxt on :3000). */
  webInternalUrl: (process.env.WEB_INTERNAL_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, ''),
  tickMs: 2000,
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
}
