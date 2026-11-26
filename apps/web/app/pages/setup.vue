<script setup lang="ts">
const toast = useToast()
const dash = useDashboard()
const config = useRuntimeConfig()
const { data: channel, refresh: refreshChannel } = await useChannel()
const { data: chat, refresh: refreshChat } = await useChatConfig()

const chatServer = computed(() => config.public.chatServerUrl || (import.meta.client ? location.origin : ''))

async function rotateIngest() {
  if (!confirm('Reset your stream key? You will need to paste the new one into OBS.')) return
  try {
    await $fetch('/api/channel/rotate', { method: 'POST' })
    await refreshChannel()
    toast.add({ title: 'Stream key reset', icon: 'i-lucide-check', color: 'success' })
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Could not reset key', color: 'error' })
  }
}

async function rotateToken() {
  if (!confirm('Reset the plugin token? OBS will need the new one.')) return
  await $fetch('/api/chat/rotate', { method: 'POST' })
  await refreshChat()
  toast.add({ title: 'Plugin token reset', icon: 'i-lucide-check', color: 'success' })
}

const obsSettings = [
  { k: 'Service', v: 'Custom…' },
  { k: 'Keyframe interval', v: '2 s' },
  { k: 'Video bitrate', v: '6000 Kbps' },
  { k: 'Rate control', v: 'CBR' },
  { k: 'Audio', v: 'AAC · 160 Kbps' },
]
</script>

<template>
  <UDashboardPanel id="setup">
    <template #header>
      <UDashboardNavbar title="Setup" :ui="{ root: 'h-12' }" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-6">
        <Section title="Stream from OBS" description="OBS → Settings → Stream. Choose “Custom…” and paste these.">
          <div class="space-y-4">
            <CopyField label="Server" :value="channel?.ingestUrl ?? ''" />
            <CopyField label="Stream key" :value="channel?.ingestKey ?? ''" secret hint="Keep this private">
              <template #actions>
                <UTooltip :text="dash.isLive.value ? 'Stop streaming first' : 'Reset key'">
                  <UButton icon="i-lucide-rotate-ccw" size="xs" variant="ghost" color="neutral" aria-label="Reset stream key" :disabled="dash.isLive.value" @click="rotateIngest" />
                </UTooltip>
              </template>
            </CopyField>

            <div>
              <p class="section-label mb-2">Recommended OBS output settings</p>
              <dl class="grid grid-cols-2 sm:grid-cols-5 overflow-hidden rounded-md border border-default divide-x divide-default">
                <div v-for="s in obsSettings" :key="s.k" class="px-3 py-2">
                  <dt class="text-[11px] text-dimmed">{{ s.k }}</dt>
                  <dd class="font-mono text-xs text-highlighted">{{ s.v }}</dd>
                </div>
              </dl>
              <p class="mt-2 text-xs text-dimmed">
                LiveLoom forwards your stream without re-encoding, so these are what every platform receives. 6000 Kbps works on all of them.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Multichat OBS plugin" description="Merged Twitch, Kick and YouTube chat as an OBS dock and an on-stream source.">
          <template #actions>
            <UBadge :label="`v${PLUGIN_VERSION}`" variant="subtle" color="neutral" class="font-mono" />
          </template>
          <div class="space-y-5">
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
                <p class="mt-1 text-[11px] leading-snug text-dimmed">{{ d.hint }}</p>
              </a>
            </div>

            <ol class="space-y-1.5 text-xs text-muted list-decimal pl-4">
              <li>Install the plugin and restart OBS. The <span class="text-highlighted">Multichat</span> dock opens.</li>
              <li>Click ⚙ in the dock and paste the server and token below.</li>
              <li>Add chat to a scene with <span class="text-highlighted">Sources → + → Multichat</span>.</li>
            </ol>

            <CopyField label="Plugin server" :value="chatServer" />
            <CopyField label="Plugin token" :value="chat?.token ?? ''" secret>
              <template #actions>
                <UTooltip text="Reset token">
                  <UButton icon="i-lucide-rotate-ccw" size="xs" variant="ghost" color="neutral" aria-label="Reset plugin token" @click="rotateToken" />
                </UTooltip>
              </template>
            </CopyField>
          </div>
        </Section>
      </div>
    </template>
  </UDashboardPanel>
</template>
