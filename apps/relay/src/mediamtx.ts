import { config } from './config'

export const RELAY_USER = 'relay'
const auth = 'Basic ' + btoa(`${RELAY_USER}:${config.relaySecret}`)

interface PathItem {
  name: string
  ready?: boolean
  online?: boolean
  available?: boolean
}

/** Paths ("live/<ingestKey>") that currently have a publisher. */
export async function livePaths(): Promise<Set<string>> {
  const res = await fetch(`${config.mediamtxApi}/v3/paths/list?itemsPerPage=1000`, {
    headers: { authorization: auth },
    signal: AbortSignal.timeout(3000),
  })
  if (!res.ok) throw new Error(`MediaMTX API ${res.status}`)
  const body = (await res.json()) as { items?: PathItem[] }
  return new Set(
    (body.items ?? []).filter((p) => p.ready ?? p.online ?? p.available).map((p) => p.name),
  )
}

/** Input URL the relay's ffmpeg reads from (authenticated as the relay user). */
export function inputUrl(ingestKey: string): string {
  const q = new URLSearchParams({ user: RELAY_USER, pass: config.relaySecret })
  return `${config.mediamtxRtmp}/live/${ingestKey}?${q}`
}
