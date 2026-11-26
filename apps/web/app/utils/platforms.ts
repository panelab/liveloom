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

export const platformColor: Record<PlatformId, string> = {
  youtube: '#ff0033',
  twitch: '#9146ff',
  kick: '#53fc18',
  facebook: '#1877f2',
  tiktok: '#fe2c55',
  x: '#e7e7e7',
  custom: '#a1a1aa',
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

export function formatKbps(kbps: number | null | undefined): string {
  if (!kbps) return '—'
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`
}

/** Destination state → status tone + label, shared by every list. */
export function destinationStatus(enabled: boolean, state: string, channelLive: boolean): { tone: 'live' | 'info' | 'warning' | 'error' | 'idle' | 'off', label: string } {
  if (!enabled) return { tone: 'off', label: 'Off' }
  switch (state) {
    case 'live': return { tone: 'live', label: 'Live' }
    case 'connecting': return { tone: 'info', label: 'Connecting' }
    case 'retrying': return { tone: 'warning', label: 'Reconnecting' }
    case 'error': return { tone: 'error', label: 'Error' }
    default: return channelLive ? { tone: 'info', label: 'Starting' } : { tone: 'idle', label: 'Ready' }
  }
}

export const PLUGIN_VERSION = '0.2.0'
const REL = `https://github.com/panelab/liveloom/releases/download/obs-multichat-v${PLUGIN_VERSION}`
export const pluginDownloads = [
  { os: 'Windows', icon: 'i-simple-icons-windows', file: `obs-multichat-${PLUGIN_VERSION}-windows-x64.zip`, hint: 'Extract into C:\\ProgramData\\obs-studio\\plugins' },
  { os: 'macOS', icon: 'i-simple-icons-apple', file: `obs-multichat-${PLUGIN_VERSION}-macos-universal.pkg`, hint: 'Run the installer (right-click → Open the first time)' },
  { os: 'Linux', icon: 'i-simple-icons-linux', file: `obs-multichat-${PLUGIN_VERSION}-x86_64-linux-gnu.deb`, hint: 'sudo apt install ./obs-multichat-*.deb' },
].map((d) => ({ ...d, url: `${REL}/${d.file}` }))

export const PLATFORM_NAMES: Record<string, string> = {
  youtube: 'YouTube', twitch: 'Twitch', kick: 'Kick', facebook: 'Facebook', tiktok: 'TikTok', x: 'X', custom: 'Custom RTMP',
}
