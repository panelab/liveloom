import type { Subprocess } from 'bun'
import type { DestinationState } from '@sp/shared'
import { config } from './config'

const MAX_BACKOFF_MS = 30_000
const STABLE_MS = 30_000

/**
 * One ffmpeg process copying the ingest stream to one platform (`-c copy`,
 * no re-encode). Restarts itself with exponential backoff until stopped.
 */
export class Push {
  state: DestinationState = 'idle'
  message: string | null = null
  bitrateKbps: number | null = null
  startedAt: number | null = null

  private proc: Subprocess<'ignore', 'pipe', 'pipe'> | null = null
  private stopped = false
  private failures = 0
  private retryTimer: Timer | null = null
  private spawnedAt = 0
  private lastSize = 0
  private lastSizeAt = 0

  constructor(
    readonly destinationId: string,
    /** Changes when the destination is edited; caller restarts on mismatch. */
    readonly version: number,
    readonly input: string,
    private readonly output: string,
    /** Strings that must never appear in logs/status (stream key). */
    private readonly secrets: string[],
    /** Codec/mapping args; default copies every stream unchanged. */
    private readonly codecArgs: string[] = ['-map', '0', '-c', 'copy'],
  ) {}

  start() {
    this.stopped = false
    this.spawn()
  }

  stop() {
    this.stopped = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.proc?.kill('SIGTERM')
    this.proc = null
    this.state = 'idle'
    this.bitrateKbps = null
    this.startedAt = null
  }

  private redact(s: string): string {
    let out = s
    for (const sec of this.secrets) if (sec) out = out.split(sec).join('••••')
    return out.replace(/(pass=)[^&\s]+/g, '$1••••')
  }

  private spawn() {
    this.state = 'connecting'
    this.bitrateKbps = null
    this.lastSize = 0
    this.spawnedAt = this.lastSizeAt = Date.now()

    const proc = Bun.spawn(
      [
        config.ffmpegPath, '-hide_banner', '-loglevel', 'error', '-nostats',
        '-progress', 'pipe:1',
        ...(this.input.startsWith('rtsp:') ? ['-rtsp_transport', 'tcp', '-timeout', '15000000'] : ['-rw_timeout', '15000000']),
        '-i', this.input,
        ...this.codecArgs,
        '-f', 'flv', '-flvflags', 'no_duration_filesize',
        this.output,
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    )
    this.proc = proc
    this.readProgress(proc)
    let lastErr = ''
    this.readLines(proc.stderr, (line) => {
      if (line.trim()) lastErr = line.trim()
    })

    proc.exited.then((code) => {
      if (this.proc !== proc || this.stopped) return
      this.proc = null
      const ranFor = Date.now() - this.spawnedAt
      this.failures = ranFor > STABLE_MS ? 1 : this.failures + 1
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (this.failures - 1))
      this.state = this.failures >= 5 ? 'error' : 'retrying'
      this.message = this.redact(lastErr || `ffmpeg exited (${code})`) + ` · retry in ${Math.round(delay / 1000)}s`
      this.bitrateKbps = null
      console.warn(`[push ${this.destinationId.slice(0, 8)}] ${this.message}`)
      this.retryTimer = setTimeout(() => !this.stopped && this.spawn(), delay)
    })
  }

  private readProgress(proc: Subprocess<'ignore', 'pipe', 'pipe'>) {
    this.readLines(proc.stdout, (line) => {
      const [k, v] = line.split('=', 2)
      if (k !== 'total_size' || this.proc !== proc) return
      const size = Number(v)
      if (!Number.isFinite(size)) return
      const now = Date.now()
      if (size > this.lastSize) {
        if (this.state !== 'live') {
          this.state = 'live'
          this.message = null
          this.startedAt ??= now
        }
        const dt = (now - this.lastSizeAt) / 1000
        if (dt >= 1) {
          this.bitrateKbps = Math.round(((size - this.lastSize) * 8) / 1000 / dt)
          this.lastSize = size
          this.lastSizeAt = now
        }
      }
    })
  }

  private async readLines(stream: ReadableStream<Uint8Array>, onLine: (l: string) => void) {
    const dec = new TextDecoder()
    let buf = ''
    try {
      for await (const chunk of stream) {
        buf += dec.decode(chunk, { stream: true })
        let i: number
        while ((i = buf.indexOf('\n')) >= 0) {
          onLine(buf.slice(0, i))
          buf = buf.slice(i + 1)
        }
      }
    } catch {
      // process gone
    }
  }
}
