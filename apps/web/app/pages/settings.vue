<script setup lang="ts">
const toast = useToast()
const dash = useDashboard()
const origin = useSiteOrigin()
const colorMode = useColorMode()
const actions = useDestinationActions()
const { data: channel, refresh: refreshChannel } = await useChannel()
const { data: chat, refresh: refreshChat } = await useChatConfig()
const { data: connections } = await useConnections()

async function rotateIngest() {
  if (!confirm('Reset your stream key? OBS or other software will need the new one (sign in from the plugin again, or paste it).')) return
  try {
    await $fetch('/api/channel/rotate', { method: 'POST' })
    await refreshChannel()
    toast.add({ title: 'Stream key reset', icon: 'i-lucide-check', color: 'success' })
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Could not reset key', color: 'error' })
  }
}
async function rotateToken() {
  if (!confirm('Sign out every OBS plugin? They’ll need to sign in again.')) return
  await $fetch('/api/chat/rotate', { method: 'POST' })
  await refreshChat()
  toast.add({ title: 'Plugins signed out', icon: 'i-lucide-check', color: 'success' })
}

const themes = [
  { label: 'Dark', value: 'dark', icon: 'i-lucide-moon' },
  { label: 'Light', value: 'light', icon: 'i-lucide-sun' },
  { label: 'System', value: 'system', icon: 'i-lucide-monitor' },
]
const accents = [
  { id: 'blue', label: 'Blue', color: 'oklch(0.64 0.19 255)' },
  { id: 'violet', label: 'Violet', color: 'oklch(0.64 0.19 292)' },
  { id: 'pink', label: 'Pink', color: 'oklch(0.66 0.2 354)' },
  { id: 'orange', label: 'Orange', color: 'oklch(0.68 0.19 42)' },
  { id: 'amber', label: 'Amber', color: 'oklch(0.82 0.16 78)' },
  { id: 'mint', label: 'Mint', color: 'oklch(0.8 0.13 168)' },
  { id: 'mono', label: 'Mono', color: 'var(--ui-text-highlighted)' },
]
const accent = useAccent()
function setAccent(id: string) {
  accent.value = id
}
const shortcuts = [
  { keys: ['meta', 'K'], label: 'Search and commands' },
  { keys: ['/'], label: 'Search and commands' },
  { keys: ['C'], label: 'Add destination' },
  { keys: ['G', 'H'], label: 'Go to Home' },
  { keys: ['G', 'C'], label: 'Go to Chat' },
  { keys: ['G', 'O'], label: 'Go to OBS setup' },
  { keys: ['G', 'B'], label: 'Go to Go live from browser' },
  { keys: ['G', 'S'], label: 'Go to Settings' },
  { keys: ['Z'], label: 'Studio: zoom in / out' },
]
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-2xl space-y-10 py-2">
        <h1 class="text-display">Settings</h1>

        <UiPanel title="Connected accounts" description="Signing in lets LiveLoom fill in and refresh your stream keys and chat. It can’t post or change anything." flush>
          <ul>
            <li v-for="c in connections" :key="c.platform" class="row min-h-12 not-last:border-b not-last:border-muted">
              <UiPlatformIcon :platform="c.platform" tile />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-highlighted">{{ c.name }}</p>
                <p class="truncate text-xs" :class="c.connected ? 'text-muted' : 'text-dimmed'">
                  {{ c.connected ? `Signed in as ${c.username}` : c.available ? 'Not connected' : 'Not set up on this server yet' }}
                </p>
              </div>
              <template v-if="c.connected">
                <UButton label="Reconnect" size="xs" variant="ghost" color="neutral" :to="`/api/connect/${c.platform}`" external />
                <UButton label="Disconnect" size="xs" variant="ghost" color="error" @click="actions.disconnect(c.platform, c.name)" />
              </template>
              <UButton v-else-if="c.available" :label="`Connect`" size="xs" variant="outline" color="neutral" :to="`/api/connect/${c.platform}`" external />
              <UButton v-else label="How to set up" size="xs" variant="ghost" color="neutral" trailing-icon="i-lucide-arrow-up-right" to="https://github.com/panelab/liveloom/blob/main/docs/connect-apps.md" target="_blank" />
            </li>
          </ul>
        </UiPanel>

        <UiPanel title="Stream key" description="For OBS without the plugin, or any other streaming app: Settings → Stream → Service: Custom.">
          <div class="space-y-4">
            <UiCopyField label="Server" :value="channel?.ingestUrl ?? ''" />
            <UiCopyField label="Stream key" :value="channel?.ingestKey ?? ''" secret hint="Keep this private">
              <template #actions>
                <UTooltip :text="dash.isLive.value ? 'Stop streaming first' : 'Reset key'">
                  <UButton icon="i-lucide-rotate-ccw" size="xs" variant="ghost" color="neutral" aria-label="Reset stream key" :disabled="dash.isLive.value" @click="rotateIngest" />
                </UTooltip>
              </template>
            </UiCopyField>
          </div>
        </UiPanel>

        <UiPanel title="OBS plugin" description="Signing in from the plugin is easiest. To connect it by hand, click ⚙ in the Multichat dock and paste these.">
          <template #actions>
            <UBadge v-if="chat?.pluginSeen" label="Signed in" icon="i-lucide-check" color="success" variant="soft" />
          </template>
          <div class="space-y-4">
            <UiCopyField label="Server" :value="origin" />
            <UiCopyField label="Token" :value="chat?.token ?? ''" secret />
            <UButton label="Sign out all plugins" variant="outline" color="neutral" icon="i-lucide-log-out" @click="rotateToken" />
          </div>
        </UiPanel>

        <UiPanel title="Appearance" plain>
          <div class="space-y-4">
          <div class="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent color">
            <UTooltip v-for="a in accents" :key="a.id" :text="a.label">
              <button
                type="button"
                role="radio"
                :aria-checked="accent === a.id"
                :aria-label="a.label"
                class="grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-(--ui-bg) transition-shadow"
                :class="accent === a.id ? 'ring-2 ring-(--ui-text-highlighted)' : 'ring-1 ring-(--ui-border)'"
                :style="{ background: a.color }"
                @click="setAccent(a.id)"
              />
            </UTooltip>
          </div>
          <UFieldGroup>
            <UButton
              v-for="t in themes"
              :key="t.value"
              :label="t.label"
              :icon="t.icon"
              color="neutral"
              :variant="colorMode.preference === t.value ? 'soft' : 'outline'"
              @click="colorMode.preference = t.value"
            />
          </UFieldGroup>
          </div>
        </UiPanel>

        <UiPanel id="shortcuts" title="Keyboard shortcuts" flush>
          <ul>
            <li v-for="s in shortcuts" :key="s.label + s.keys.join()" class="row not-last:border-b not-last:border-muted">
              <span class="flex-1 text-sm text-toned">{{ s.label }}</span>
              <span class="flex gap-1"><UKbd v-for="k in s.keys" :key="k" :value="k" /></span>
            </li>
          </ul>
        </UiPanel>
      </div>
    </template>
  </UDashboardPanel>
</template>
