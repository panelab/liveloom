// Unambiguous letters only (no vowels → no accidental words, no 0/O/1/I).
const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'

export function newUserCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `${chars.slice(0, 4)}-${chars.slice(4)}`
}

export function normalizeUserCode(input: string) {
  const c = input.toUpperCase().replace(/[^A-Z]/g, '')
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : null
}

export async function sha256(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const DEVICE_CODE_TTL_MS = 10 * 60_000
export const DEVICE_POLL_INTERVAL_S = 3
