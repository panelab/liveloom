import { channels, createDb, eq } from '@sp/db'
import { runMigrations } from '@sp/db/migrate'
import { config } from './config'
import { RELAY_USER } from './mediamtx'
import { Supervisor } from './supervisor'
import { ChatHub } from './chat/hub'
import type { ChatEvent } from '@sp/shared'

await runMigrations(config.databaseUrl, config.databaseAuthToken)
const db = createDb({ url: config.databaseUrl, authToken: config.databaseAuthToken })
const supervisor = new Supervisor(db)
const chat = new ChatHub(db)

/** Body MediaMTX POSTs to authHTTPAddress. */
interface AuthRequest {
  user?: string
  password?: string
  ip?: string
  action: 'publish' | 'read' | 'playback' | 'api' | 'metrics' | 'pprof'
  path?: string
  protocol?: string
}

const isRelay = (r: AuthRequest) => r.user === RELAY_USER && r.password === config.relaySecret

async function authorize(r: AuthRequest): Promise<boolean> {
  if (isRelay(r)) return true
  if (r.action !== 'publish') return false
  const m = /^live\/([A-Za-z0-9_-]{8,64})$/.exec(r.path ?? '')
  if (!m) return false
  const [row] = await db.select({ id: channels.id }).from(channels).where(eq(channels.ingestKey, m[1]!)).limit(1)
  return !!row
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization' }

/**
 * Merged chat as Server-Sent Events. Used by the OBS plugin, overlays and the
 * dashboard. Auth: ?token=… or "Authorization: Bearer …" (the channel's chat token).
 */
async function chatEvents(req: Request, url: URL): Promise<Response> {
  const token = url.searchParams.get('token') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const channel = await chat.channelForToken(token)
  if (!channel) return new Response('invalid chat token', { status: 401, headers: CORS })

  const enc = new TextEncoder()
  let cleanup = () => {}
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const write = (s: string) => {
        try { ctrl.enqueue(enc.encode(s)) } catch { cleanup() }
      }
      const send = (ev: ChatEvent) => write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`)
      write('retry: 3000\n\n')
      const unsubscribe = await chat.subscribe(channel, send)
      const ping = setInterval(() => write(': ping\n\n'), 15_000)
      cleanup = () => { clearInterval(ping); unsubscribe(); cleanup = () => {} }
      req.signal.addEventListener('abort', () => cleanup())
    },
    cancel() { cleanup() },
  })
  return new Response(stream, {
    headers: {
      ...CORS,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  idleTimeout: 120, // SSE sends a ping every 15s
  async fetch(req) {
    const url = new URL(req.url)
    const { pathname } = url
    if (pathname === '/health') return Response.json({ ok: true })
    if (req.method === 'OPTIONS' && pathname.startsWith('/chat/')) return new Response(null, { status: 204, headers: CORS })
    if (pathname === '/chat/events' && req.method === 'GET') return chatEvents(req, url)
    if (pathname === '/mediamtx/auth' && req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as AuthRequest | null
      const ok = !!body && (await authorize(body).catch(() => false))
      if (body?.action === 'publish') console.log(`[auth] publish ${ok ? 'allowed' : 'denied'} from ${body.ip}`)
      return new Response(null, { status: ok ? 200 : 401 })
    }
    return new Response('not found', { status: 404 })
  },
})

supervisor.start()
chat.start()
console.log(`relay listening on http://${server.hostname}:${server.port}`)

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    console.log(`\n${sig}: stopping pushes…`)
    chat.stop()
    await supervisor.stop().catch(() => {})
    server.stop()
    process.exit(0)
  })
}
