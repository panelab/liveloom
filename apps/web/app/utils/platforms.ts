import type { PlatformId } from '@sp/shared'

export const platformIcon: Record<PlatformId, string> = {
  youtube: 'i-simple-icons-youtube',
  twitch: 'i-simple-icons-twitch',
  kick: 'i-simple-icons-kick',
  facebook: 'i-simple-icons-facebook',
  tiktok: 'i-simple-icons-tiktok',
  x: 'i-simple-icons-x',
  custom: 'i-lucide-radio-tower',
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}
