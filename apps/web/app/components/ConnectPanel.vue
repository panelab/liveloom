<script setup lang="ts">
const toast = useToast()
const dash = useDashboard()
const { data: connections, refresh } = await useConnections()
const busy = ref<string | null>(null)

const blurb: Record<string, string> = {
  youtube: 'Uses your YouTube Studio stream key and @handle.',
  twitch: 'Uses your Twitch stream key and channel chat.',
  kick: 'Uses your Kick stream URL, key and chat.',
}

async function sync(p: string, name: string) {
  busy.value = p
  try {
    await $fetch(`/api/connect/${p}/sync`, { method: 'POST' })
    toast.add({ title: `${name} key refreshed`, icon: 'i-lucide-check', color: 'success', duration: 2000 })
    dash.refresh()
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Could not refresh', color: 'error' })
  } finally {
    busy.value = null
  }
}

async function disconnect(p: string, name: string) {
  if (!confirm(`Disconnect ${name}? Your ${name} destination stays, but LiveLoom won’t be able to refresh its key.`)) return
  await $fetch(`/api/connect/${p}`, { method: 'DELETE' })
  await refresh()
  toast.add({ title: `${name} disconnected`, duration: 2000 })
}

function menu(c: { platform: string, name: string }) {
  return [[
    { label: 'Refresh stream key', icon: 'i-lucide-refresh-cw', onSelect: () => sync(c.platform, c.name) },
    { label: 'Reconnect', icon: 'i-lucide-log-in', onSelect: () => { window.location.href = `/api/connect/${c.platform}` } },
  ], [
    { label: 'Disconnect', icon: 'i-lucide-unlink', color: 'error' as const, onSelect: () => disconnect(c.platform, c.name) },
  ]]
}
</script>

<template>
  <UiPanel title="Connected accounts" description="Sign in once and LiveLoom fetches your stream key, server and chat for you." flush>
    <ul class="grid divide-y divide-default sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <li v-for="c in connections" :key="c.platform" class="flex flex-col gap-3 p-4">
        <div class="flex items-center gap-2.5">
          <UiPlatformIcon :platform="c.platform" tile />
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">{{ c.name }}</p>
            <p class="truncate text-xs" :class="c.connected ? 'text-success' : 'text-dimmed'">
              {{ c.connected ? c.username : c.available ? 'Not connected' : 'Not available yet' }}
            </p>
          </div>
          <UDropdownMenu v-if="c.connected" :items="menu(c)" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis" variant="ghost" color="neutral" size="xs" class="ml-auto" :loading="busy === c.platform" :aria-label="`${c.name} options`" />
          </UDropdownMenu>
        </div>
        <p class="text-xs text-muted">{{ blurb[c.platform] }}</p>
        <UButton
          v-if="!c.connected"
          :label="`Connect ${c.name}`"
          :to="c.available ? `/api/connect/${c.platform}` : undefined"
          :disabled="!c.available"
          external
          block
          :variant="c.available ? 'solid' : 'outline'"
          color="neutral"
          class="mt-auto"
        />
        <UBadge v-else label="Connected" icon="i-lucide-check" color="success" variant="subtle" class="mt-auto self-start" />
      </li>
    </ul>
    <template v-if="connections.some((c) => !c.available)" #footer>
      <p class="text-xs text-muted">
        Buttons marked “Not available yet” need a developer app registered on that platform.
        <ULink to="https://github.com/panelab/liveloom/blob/main/docs/connect-apps.md" target="_blank" class="text-highlighted underline">Setup guide</ULink>
      </p>
    </template>
  </UiPanel>
</template>
