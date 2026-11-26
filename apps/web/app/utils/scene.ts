import type { ChatMessage } from '@sp/shared'

/**
 * Studio scene: everything that's drawn on the output canvas. All positions
 * are fractions of the canvas (0–1) so a scene looks the same at 720p and 1080p.
 */
export type CameraShape = 'circle' | 'rounded' | 'square'
export type Background = 'none' | 'graphite' | 'dusk' | 'ocean' | 'ember' | 'forest'

export interface Scene {
  background: Background
  /** Gap around the screen as a fraction of canvas height (0 = edge to edge). */
  padding: number
  /** Screen corner radius as a fraction of canvas height. */
  radius: number
  camera: { x: number, y: number, size: number, shape: CameraShape, mirror: boolean, border: boolean }
  chat: { on: boolean, x: number, y: number, w: number, h: number, scale: number, opacity: number, fadeAfter: number }
}

export const DEFAULT_SCENE: Scene = {
  background: 'none',
  padding: 0,
  radius: 0,
  camera: { x: 0.86, y: 0.78, size: 0.3, shape: 'circle', mirror: true, border: true },
  chat: { on: false, x: 0.02, y: 0.38, w: 0.26, h: 0.58, scale: 1, opacity: 0.55, fadeAfter: 0 },
}

export const BACKGROUNDS: { id: Background, label: string, stops: string[] }[] = [
  { id: 'none', label: 'None', stops: ['#000', '#000'] },
  { id: 'graphite', label: 'Graphite', stops: ['#2a2d34', '#0e0f12'] },
  { id: 'dusk', label: 'Dusk', stops: ['#5b4bd6', '#1b1340'] },
  { id: 'ocean', label: 'Ocean', stops: ['#0f7ea8', '#0a1f3d'] },
  { id: 'ember', label: 'Ember', stops: ['#e2683c', '#3a0f1f'] },
  { id: 'forest', label: 'Forest', stops: ['#2f8f63', '#0b2219'] },
]

export const CAMERA_PRESETS = [
  { id: 'br', label: 'Bottom right', x: 0.86, y: 0.78 },
  { id: 'bl', label: 'Bottom left', x: 0.14, y: 0.78 },
  { id: 'tr', label: 'Top right', x: 0.86, y: 0.22 },
  { id: 'tl', label: 'Top left', x: 0.14, y: 0.22 },
] as const

export interface Rect { x: number, y: number, w: number, h: number }

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

/** Fit a source (sw×sh) inside a box, keeping its aspect ratio. */
export function contain(sw: number, sh: number, box: Rect): Rect {
  const s = Math.min(box.w / sw, box.h / sh)
  const w = sw * s
  const h = sh * s
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

export function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, Math.max(0, Math.min(radius, r.w / 2, r.h / 2)))
}

export function fillBackground(ctx: CanvasRenderingContext2D, W: number, H: number, bg: Background) {
  const def = BACKGROUNDS.find((b) => b.id === bg) ?? BACKGROUNDS[0]!
  if (bg === 'none') {
    ctx.fillStyle = '#000'
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, def.stops[0]!)
    g.addColorStop(1, def.stops[1]!)
    ctx.fillStyle = g
  }
  ctx.fillRect(0, 0, W, H)
}

/* ── Chat overlay ─────────────────────────────────────────────────────── */

const PLATFORM_COLOR: Record<string, string> = { twitch: '#9146ff', kick: '#53fc18', youtube: '#ff0033' }
const emoteCache = new Map<string, HTMLImageElement | null>()

/** Emotes are drawn only if their CDN allows CORS, so the canvas never gets "tainted" (which would break the stream). */
function emote(url: string): HTMLImageElement | null {
  if (emoteCache.has(url)) {
    const img = emoteCache.get(url)!
    return img && img.complete && img.naturalWidth ? img : null
  }
  if (emoteCache.size > 500) emoteCache.clear()
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onerror = () => emoteCache.set(url, null)
  img.src = url
  emoteCache.set(url, img)
  return null
}

type Token = { kind: 'text', v: string, w: number } | { kind: 'emote', url: string, name: string, w: number }
interface Laid { lines: Token[][], height: number }
const layoutCache = new Map<string, Laid>()

function layoutMessage(ctx: CanvasRenderingContext2D, m: ChatMessage, maxW: number, fs: number): Laid {
  const key = `${m.id}:${Math.round(maxW)}:${fs}`
  const hit = layoutCache.get(key)
  if (hit) return hit
  if (layoutCache.size > 600) layoutCache.clear()

  const lineH = fs * 1.35
  const tokens: Token[] = []
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`
  const name = `${m.author.name}${m.amount ? ` ${m.amount}` : ''}: `
  tokens.push({ kind: 'text', v: `\u0000${name}`, w: ctx.measureText(name).width + fs * 0.9 })
  ctx.font = `500 ${fs}px Inter, system-ui, sans-serif`
  for (const p of m.parts) {
    if (p.t === 'emote') {
      tokens.push({ kind: 'emote', url: p.url, name: p.name, w: fs * 1.5 })
    } else {
      for (const word of p.v.split(/(\s+)/)) {
        if (!word) continue
        tokens.push({ kind: 'text', v: word, w: ctx.measureText(word).width })
      }
    }
  }
  const lines: Token[][] = [[]]
  let x = 0
  for (const t of tokens) {
    if (x + t.w > maxW && x > 0 && !(t.kind === 'text' && /^\s+$/.test(t.v))) {
      lines.push([])
      x = 0
    }
    if (x === 0 && t.kind === 'text' && /^\s+$/.test(t.v)) continue
    lines[lines.length - 1]!.push(t)
    x += t.w
  }
  const laid = { lines, height: lines.length * lineH + fs * 0.45 }
  layoutCache.set(key, laid)
  return laid
}

export function drawChat(ctx: CanvasRenderingContext2D, W: number, H: number, chat: Scene['chat'], messages: ChatMessage[], now: number) {
  const box: Rect = { x: chat.x * W, y: chat.y * H, w: chat.w * W, h: chat.h * H }
  const fs = Math.round(H * 0.021 * chat.scale)
  const pad = fs * 0.7
  const lineH = fs * 1.35
  const visible = chat.fadeAfter > 0 ? messages.filter((m) => now - m.ts < chat.fadeAfter * 1000) : messages
  if (chat.opacity > 0 && (visible.length || chat.fadeAfter === 0)) {
    ctx.fillStyle = `rgba(10,10,14,${chat.opacity})`
    roundRect(ctx, box, fs * 0.6)
    ctx.fill()
  }
  ctx.save()
  roundRect(ctx, box, fs * 0.6)
  ctx.clip()
  ctx.textBaseline = 'middle'
  let y = box.y + box.h - pad
  for (let i = visible.length - 1; i >= 0 && y > box.y; i--) {
    const m = visible[i]!
    const laid = layoutMessage(ctx, m, box.w - pad * 2, fs)
    y -= laid.height
    const age = chat.fadeAfter > 0 ? (now - m.ts) / 1000 : 0
    ctx.globalAlpha = chat.fadeAfter > 0 ? clamp(chat.fadeAfter - age, 0, 1) : 1
    laid.lines.forEach((line, li) => {
      let x = box.x + pad
      const cy = y + li * lineH + lineH / 2
      for (const t of line) {
        if (t.kind === 'emote') {
          const img = emote(t.url)
          if (img) ctx.drawImage(img, x, cy - fs * 0.7, fs * 1.4 * (img.naturalWidth / img.naturalHeight || 1), fs * 1.4)
          else {
            ctx.font = `500 ${fs}px Inter, system-ui, sans-serif`
            ctx.fillStyle = '#e8e8ee'
            ctx.fillText(t.name, x, cy)
          }
        } else if (t.v.startsWith('\u0000')) {
          ctx.fillStyle = PLATFORM_COLOR[m.platform] ?? '#999'
          ctx.beginPath()
          ctx.arc(x + fs * 0.3, cy, fs * 0.3, 0, Math.PI * 2)
          ctx.fill()
          ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`
          ctx.fillStyle = m.author.color || PLATFORM_COLOR[m.platform] || '#fff'
          ctx.fillText(t.v.slice(1), x + fs * 0.9, cy)
        } else {
          ctx.font = `500 ${fs}px Inter, system-ui, sans-serif`
          ctx.fillStyle = '#f2f2f5'
          ctx.fillText(t.v, x, cy)
        }
        x += t.w
      }
    })
    y -= fs * 0.15
  }
  ctx.globalAlpha = 1
  ctx.restore()
}

/* ── Persistence (per browser) ────────────────────────────────────────── */

const KEY = 'liveloom.studio.scene.v1'
export function loadScene(): Scene {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw)
      return { ...DEFAULT_SCENE, ...s, camera: { ...DEFAULT_SCENE.camera, ...s.camera }, chat: { ...DEFAULT_SCENE.chat, ...s.chat } }
    }
  } catch {}
  return structuredClone(DEFAULT_SCENE)
}
export function saveScene(s: Scene) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
}
