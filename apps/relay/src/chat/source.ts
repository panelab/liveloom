import type { ChatMessage, ChatPlatform, ChatSourceState } from '@sp/shared'

export interface SourceEvents {
  onMessage(m: ChatMessage): void
  onState(state: ChatSourceState, message?: string): void
}

/** One platform connection. Reconnects on its own until stop() is called. */
export abstract class ChatSource {
  abstract readonly platform: ChatPlatform
  protected stopped = false
  private failures = 0
  private retryTimer: Timer | null = null

  constructor(readonly target: string, protected events: SourceEvents) {}

  start() {
    this.stopped = false
    void this.run()
  }

  stop() {
    this.stopped = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.close()
  }

  /** Connect and stream until the connection ends (resolve) or fails (throw). */
  protected abstract connect(): Promise<void>
  protected abstract close(): void

  protected connected() {
    this.failures = 0
    this.events.onState('connected')
  }

  /** Schedule the next attempt; `offline` waits longer and isn't an error. */
  protected retry(state: ChatSourceState, message: string | undefined, delayMs?: number) {
    if (this.stopped) return
    this.failures++
    const delay = delayMs ?? Math.min(60_000, 1000 * 2 ** Math.min(this.failures, 6))
    this.events.onState(state, message)
    this.retryTimer = setTimeout(() => void this.run(), delay)
  }

  private async run() {
    if (this.stopped) return
    this.events.onState('connecting')
    try {
      await this.connect()
      if (!this.stopped) this.retry('connecting', 'Disconnected, reconnecting…')
    } catch (e) {
      if (e instanceof OfflineError) this.retry('offline', e.message, 30_000)
      else this.retry('error', e instanceof Error ? e.message : String(e))
    }
  }
}

/** The channel exists but isn't live (YouTube): poll again later. */
export class OfflineError extends Error {}

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

/** Resolves when the socket closes; rejects if it never opens. */
export function socketLifetime(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    let opened = false
    ws.addEventListener('open', () => { opened = true })
    ws.addEventListener('close', () => (opened ? resolve() : reject(new Error('Could not connect'))))
    ws.addEventListener('error', () => { if (!opened) reject(new Error('Could not connect')) })
  })
}
