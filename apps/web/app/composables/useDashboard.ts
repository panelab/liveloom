import type { HealthIssue, IngestHealth, PlatformId } from '@sp/shared'

export interface DestinationView {
  id: string
  platform: PlatformId
  name: string
  serverUrl: string
  streamKeyHint: string
  enabled: boolean
  connected: boolean
  status: { state: string, message: string | null, bitrateKbps: number | null, startedAt: number | null }
}

/**
 * Live state shared by the sidebar and every page: one poll every 2s while
 * the tab is visible (the relay writes status to the DB at that rate).
 */
export function useDashboard() {
  const data = useState<{ isLive: boolean, liveSince: number | null, destinations: DestinationView[], health: IngestHealth | null, issues: HealthIssue[] } | null>('dash', () => null)
  const now = useState('dash-now', () => Date.now())
  const pending = useState('dash-pending', () => true)

  async function refresh() {
    try {
      data.value = await $fetch('/api/destinations') as any
    } finally {
      pending.value = false
    }
  }

  const destinations = computed(() => data.value?.destinations ?? [])
  const isLive = computed(() => data.value?.isLive ?? false)
  const liveSince = computed(() => data.value?.liveSince ?? null)
  const enabled = computed(() => destinations.value.filter((d) => d.enabled))
  const streaming = computed(() => enabled.value.filter((d) => d.status.state === 'live'))
  const totalKbps = computed(() => streaming.value.reduce((n, d) => n + (d.status.bitrateKbps ?? 0), 0))
  const uptime = computed(() => (liveSince.value ? formatDuration(now.value - liveSince.value) : null))

  const health = computed(() => data.value?.health ?? null)
  const issues = computed(() => data.value?.issues ?? [])

  return { data, now, pending, refresh, destinations, isLive, liveSince, enabled, streaming, totalKbps, uptime, health, issues }
}

/** Call once (in the layout) to start polling. */
export function useDashboardPolling() {
  const dash = useDashboard()
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    dash.refresh()
    timer = setInterval(() => {
      dash.now.value = Date.now()
      if (document.visibilityState === 'visible') dash.refresh()
    }, 2000)
  })
  onBeforeUnmount(() => clearInterval(timer))
  return dash
}

export function useChannel() {
  return useFetch('/api/channel', { key: 'channel' })
}

export function useConnections() {
  return useFetch('/api/connect', { key: 'connections', default: () => [] })
}

/** The dashboard's public origin (same on server and client, so no hydration mismatch). */
export function useSiteOrigin() {
  const config = useRuntimeConfig()
  const req = useRequestURL()
  return computed(() => (config.public.siteUrl as string) || req.origin)
}

export function useChatConfig() {
  return useFetch('/api/chat', { key: 'chat-config' })
}

export async function copyText(text: string, what: string) {
  await navigator.clipboard.writeText(text)
  useToast().add({ title: `${what} copied`, icon: 'i-lucide-check', color: 'success', duration: 1500 })
}
