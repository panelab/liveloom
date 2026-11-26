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

/** The one Add/Edit destination dialog, mounted in the layout and opened from anywhere (pages, ⌘K, the C shortcut). */
export function useDestinationDialog() {
  const state = useState<{ open: boolean, editing: DestinationView | null, platform: PlatformId | null }>('dest-dialog', () => ({ open: false, editing: null, platform: null }))
  return {
    state,
    add: (platform: PlatformId | null = null) => { state.value = { open: true, editing: null, platform } },
    edit: (d: DestinationView) => { state.value = { open: true, editing: d, platform: d.platform } },
  }
}

/** Shared row actions for a destination (list menus and the command menu). */
export function useDestinationActions() {
  const dash = useDashboard()
  const toast = useToast()
  const dialog = useDestinationDialog()
  const { refresh: refreshConnections } = useConnections()

  async function toggle(d: DestinationView, enabled = !d.enabled) {
    d.enabled = enabled
    await $fetch(`/api/destinations/${d.id}`, { method: 'PATCH', body: { enabled } })
    dash.refresh()
  }
  async function remove(d: DestinationView) {
    if (!confirm(`Delete “${d.name}”? You can add it again later.`)) return
    await $fetch(`/api/destinations/${d.id}`, { method: 'DELETE' })
    toast.add({ title: `${d.name} deleted`, duration: 2000 })
    dash.refresh()
  }
  async function refreshKey(d: DestinationView) {
    try {
      await $fetch(`/api/connect/${d.platform}/sync`, { method: 'POST' })
      toast.add({ title: 'Stream key refreshed', icon: 'i-lucide-check', color: 'success', duration: 2000 })
      dash.refresh()
    } catch (e: any) {
      toast.add({ title: e?.data?.message ?? 'Could not refresh', color: 'error' })
    }
  }
  async function disconnect(platform: string, name: string) {
    if (!confirm(`Disconnect your ${name} account? The destination stays, but LiveLoom can’t refresh its key any more.`)) return
    await $fetch(`/api/connect/${platform}`, { method: 'DELETE' })
    await refreshConnections()
    dash.refresh()
    toast.add({ title: `${name} disconnected`, duration: 2000 })
  }
  function menu(d: DestinationView) {
    const name = PLATFORM_NAMES[d.platform] ?? d.name
    return [
      [
        { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => dialog.edit(d) },
        { label: d.enabled ? 'Turn off' : 'Turn on', icon: d.enabled ? 'i-lucide-circle-pause' : 'i-lucide-circle-play', onSelect: () => toggle(d) },
        { label: 'Copy server URL', icon: 'i-lucide-copy', onSelect: () => copyText(d.serverUrl, 'Server URL') },
      ],
      d.connected
        ? [
            { label: 'Refresh stream key', icon: 'i-lucide-refresh-cw', onSelect: () => refreshKey(d) },
            { label: `Disconnect ${name} account`, icon: 'i-lucide-unlink', onSelect: () => disconnect(d.platform, name) },
          ]
        : [],
      [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(d) }],
    ].filter((g) => g.length)
  }
  return { toggle, remove, refreshKey, disconnect, menu }
}
