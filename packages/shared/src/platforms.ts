export type PlatformId = 'youtube' | 'twitch' | 'kick' | 'facebook' | 'tiktok' | 'x' | 'custom'

export interface PlatformPreset {
  id: PlatformId
  name: string
  /** Default ingest server. Empty = the platform hands you one per stream. */
  serverUrl: string
  /** Where the user finds their stream key. */
  keyHelpUrl?: string
  color: string
}

export const PLATFORMS: Record<PlatformId, PlatformPreset> = {
  youtube: {
    id: 'youtube', name: 'YouTube', color: '#ff0033',
    serverUrl: 'rtmp://a.rtmp.youtube.com/live2',
    keyHelpUrl: 'https://studio.youtube.com/channel/UC/livestreaming',
  },
  twitch: {
    id: 'twitch', name: 'Twitch', color: '#9146ff',
    serverUrl: 'rtmp://live.twitch.tv/app',
    keyHelpUrl: 'https://dashboard.twitch.tv/settings/stream',
  },
  kick: {
    id: 'kick', name: 'Kick', color: '#53fc18',
    serverUrl: 'rtmps://fa723fc1b171.global-contribute.live-video.net/app',
    keyHelpUrl: 'https://kick.com/dashboard/settings/stream',
  },
  facebook: {
    id: 'facebook', name: 'Facebook', color: '#1877f2',
    serverUrl: 'rtmps://live-api-s.facebook.com:443/rtmp',
    keyHelpUrl: 'https://www.facebook.com/live/producer',
  },
  tiktok: { id: 'tiktok', name: 'TikTok', color: '#fe2c55', serverUrl: '' },
  x: { id: 'x', name: 'X', color: '#e7e7e7', serverUrl: '' },
  custom: { id: 'custom', name: 'Custom RTMP', color: '#64748b', serverUrl: '' },
}

/**
 * Fixes common copy-paste mistakes in server URLs. Kick (and other Amazon IVS
 * ingests, *.live-video.net) need the "/app" path; their dashboards make it
 * easy to copy the URL without it.
 */
export function normalizeServerUrl(serverUrl: string): string {
  let u = serverUrl.trim().replace(/\/+$/, '')
  if (/^rtmps?:\/\/[^/]+\.live-video\.net(:\d+)?$/i.test(u)) u += '/app'
  return u
}

/** Full push URL: server + "/" + key. */
export function pushUrl(serverUrl: string, streamKey: string): string {
  return `${normalizeServerUrl(serverUrl)}/${streamKey}`
}

export function isValidServerUrl(u: string): boolean {
  return /^rtmps?:\/\/[^\s/]+/i.test(u)
}
