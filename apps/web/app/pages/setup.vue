<script setup lang="ts">
const toast = useToast()
const dash = useDashboard()
const origin = useSiteOrigin()
const { data: channel, refresh: refreshChannel } = await useChannel()
const { data: chat, refresh: refreshChat } = await useChatConfig()

async function rotateIngest() {
  if (!confirm('Reset your stream key? OBS will need the new one (sign in from the plugin again, or paste it).')) return
  try {
    await $fetch('/api/channel/rotate', { method: 'POST' })
    await refreshChannel()
    toast.add({ title: 'Stream key reset', icon: 'i-lucide-check', color: 'success' })
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Could not reset key', color: 'error' })
  }
}

async function rotateToken() {
  if (!confirm('Reset the plugin token? Signed-in OBS plugins will need to sign in again.')) return
  await $fetch('/api/chat/rotate', { method: 'POST' })
  await refreshChat()
  toast.add({ title: 'Plugin token reset', icon: 'i-lucide-check', color: 'success' })
}

const obsSettings = [
  { k: 'Keyframe interval', v: '2 s' },
  { k: 'Video bitrate', v: '6000 Kbps' },
  { k: 'Rate control', v: 'CBR' },
  { k: 'Audio', v: 'AAC · 160 Kbps' },
  { k: 'Resolution', v: '1920×1080' },
]
const manualOpen = ref(false)
</script>

<template>
  <UDashboardPanel id="setup">
    <template #header>
      <UDashboardNavbar title="Setup" :ui="{ root: 'h-14' }" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-6">
        <UiPageIntro title="Set up OBS" description="The Multichat plugin signs OBS in to LiveLoom and fills in your stream settings, so there’s nothing to copy." />

        <HealthPanel v-if="dash.isLive.value" />

        <UiPanel title="1. Install the Multichat plugin" :description="`Version ${PLUGIN_VERSION} · OBS 30 or newer`">
          <div class="grid gap-2 sm:grid-cols-3">
            <a
              v-for="d in pluginDownloads"
              :key="d.os"
              :href="d.url"
              class="group rounded-md border border-default bg-muted px-3 py-2.5 transition-colors hover:border-accented hover:bg-elevated"
            >
              <div class="flex items-center gap-2">
                <UIcon :name="d.icon" class="size-4 text-highlighted" />
                <span class="text-sm font-medium text-highlighted">{{ d.os }}</span>
                <UIcon name="i-lucide-download" class="ml-auto size-3.5 text-dimmed group-hover:text-highlighted" />
              </div>
              <p class="mt-1 text-xs text-dimmed">{{ d.hint }}</p>
            </a>
          </div>
        </UiPanel>

        <UiPanel title="2. Sign in from OBS">
          <template #actions>
            <UBadge v-if="chat?.pluginSeen" label="Signed in" icon="i-lucide-check" color="success" variant="subtle" />
          </template>
          <ol class="space-y-2 text-sm text-muted">
            <li class="flex gap-2"><span class="font-mono text-dimmed">1</span><span>Restart OBS. The <span class="text-highlighted">Multichat</span> dock opens.</span></li>
            <li class="flex gap-2"><span class="font-mono text-dimmed">2</span><span>Click <span class="text-highlighted">Sign in to LiveLoom</span> in the dock. Your browser opens with a code.</span></li>
            <li class="flex gap-2"><span class="font-mono text-dimmed">3</span><span>Check the code matches OBS and click <span class="text-highlighted">Approve</span>. OBS’s stream settings are filled in.</span></li>
          </ol>
          <p class="mt-3 text-sm text-muted">
            Browser didn’t open? Go to <ULink to="/device" class="font-mono text-highlighted underline">{{ origin.replace(/^https?:\/\//, '') }}/device</ULink> and enter the code.
          </p>
        </UiPanel>

        <UiPanel title="3. Recommended OBS settings" description="LiveLoom forwards your stream as-is, so every platform receives exactly these.">
          <dl class="grid grid-cols-2 overflow-hidden rounded-md border border-default divide-default sm:grid-cols-5 sm:divide-x">
            <div v-for="s in obsSettings" :key="s.k" class="px-3 py-2">
              <dt class="text-2xs text-dimmed">{{ s.k }}</dt>
              <dd class="font-mono text-xs text-highlighted">{{ s.v }}</dd>
            </div>
          </dl>
          <p class="mt-2 text-xs text-dimmed">OBS → Settings → Output (Output Mode: Advanced) → Streaming. 6000 Kbps works on every platform.</p>
        </UiPanel>

        <UCollapsible v-model:open="manualOpen">
          <UButton
            variant="ghost"
            color="neutral"
            :trailing-icon="manualOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            label="Set up manually instead"
            class="-ml-2.5"
          />
          <template #content>
            <UiPanel class="mt-2" title="Manual setup" description="For OBS without the plugin, or other streaming software. OBS → Settings → Stream → Service: Custom…">
              <div class="space-y-4">
                <UiCopyField label="Server" :value="channel?.ingestUrl ?? ''" />
                <UiCopyField label="Stream key" :value="channel?.ingestKey ?? ''" secret hint="Keep this private">
                  <template #actions>
                    <UTooltip :text="dash.isLive.value ? 'Stop streaming first' : 'Reset key'">
                      <UButton icon="i-lucide-rotate-ccw" size="xs" variant="ghost" color="neutral" aria-label="Reset stream key" :disabled="dash.isLive.value" @click="rotateIngest" />
                    </UTooltip>
                  </template>
                </UiCopyField>
                <USeparator />
                <p class="text-sm text-muted">Plugin without sign-in: click ⚙ in the Multichat dock and paste these.</p>
                <UiCopyField label="Plugin server" :value="origin" />
                <UiCopyField label="Plugin token" :value="chat?.token ?? ''" secret>
                  <template #actions>
                    <UTooltip text="Reset token">
                      <UButton icon="i-lucide-rotate-ccw" size="xs" variant="ghost" color="neutral" aria-label="Reset plugin token" @click="rotateToken" />
                    </UTooltip>
                  </template>
                </UiCopyField>
              </div>
            </UiPanel>
          </template>
        </UCollapsible>
      </div>
    </template>
  </UDashboardPanel>
</template>
