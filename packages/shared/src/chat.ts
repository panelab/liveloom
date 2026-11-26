/** Platforms the chat merger reads from. */
export type ChatPlatform = 'twitch' | 'kick' | 'youtube'

/** A piece of a message: plain text or an emote image. */
export type ChatPart =
  | { t: 'text', v: string }
  | { t: 'emote', name: string, url: string }

/** One chat message, the same shape for every platform. */
export interface ChatMessage {
  id: string
  platform: ChatPlatform
  author: {
    name: string
    /** #rrggbb, when the platform gives one */
    color?: string
    /** e.g. "moderator", "subscriber", "broadcaster", "verified", "member" */
    badges?: string[]
  }
  parts: ChatPart[]
  /** Plain-text version (emotes as their names) for simple clients. */
  text: string
  /** YouTube Super Chat amount, e.g. "$5.00" */
  amount?: string
  ts: number
}

export type ChatSourceState = 'off' | 'connecting' | 'connected' | 'offline' | 'error'

export interface ChatSourceStatus {
  platform: ChatPlatform
  /** Channel name we're reading, or null when not configured */
  target: string | null
  state: ChatSourceState
  message?: string
}

/** Server-sent events on /chat/events: `event: <type>`, `data: <json>` */
export type ChatEvent =
  | { type: 'hello', history: ChatMessage[], sources: ChatSourceStatus[] }
  | { type: 'message', message: ChatMessage }
  | { type: 'status', sources: ChatSourceStatus[] }
  /** Stream health for the OBS dock: empty `issues` = all good. Sent when it changes. */
  | { type: 'health', live: boolean, issues: { level: string, title: string, fix: string }[] }

export function partsToText(parts: ChatPart[]): string {
  return parts.map((p) => (p.t === 'text' ? p.v : p.name)).join('')
}
