// AES-256-GCM via Web Crypto: identical on Bun, Node and Cloudflare Workers.
// Format: base64(iv[12] || ciphertext+tag)

const te = new TextEncoder()
const td = new TextDecoder()
const keyCache = new Map<string, Promise<CryptoKey>>()

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function importKey(secretB64: string): Promise<CryptoKey> {
  let k = keyCache.get(secretB64)
  if (!k) {
    const raw = b64ToBytes(secretB64)
    if (raw.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)')
    k = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
    keyCache.set(secretB64, k)
  }
  return k
}

export async function encryptSecret(plain: string, secretB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(secretB64), te.encode(plain)))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return bytesToB64(out)
}

export async function decryptSecret(enc: string, secretB64: string): Promise<string> {
  const buf = b64ToBytes(enc)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, await importKey(secretB64), buf.slice(12))
  return td.decode(pt)
}

/** URL-safe random token, e.g. for ingest keys. */
export function randomToken(bytes = 18): string {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** "abcd…wxyz" for display; never show a full key. */
export function maskKey(key: string): string {
  return key.length <= 8 ? '••••••••' : `${key.slice(0, 4)}…${key.slice(-4)}`
}
