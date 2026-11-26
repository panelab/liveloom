<script setup lang="ts">
const dash = useDashboard()
const origin = useSiteOrigin()
const { data: channel } = await useChannel()
const { data: chat, refresh: refreshChat } = await useChatConfig()
// Notice the plugin signing in without a reload.
let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => { poll = setInterval(() => { if (!chat.value?.pluginSeen && document.visibilityState === 'visible') void refreshChat() }, 3000) })
onBeforeUnmount(() => clearInterval(poll))

// Suggest the download for this computer (decided after hydration to avoid a mismatch).
const os = ref<string | null>(null)
onMounted(() => {
  const ua = navigator.userAgent
  os.value = /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : null
})
const mine = computed(() => pluginDownloads.find((d) => d.os === os.value) ?? null)
const others = computed(() => pluginDownloads.filter((d) => d !== mine.value))
const signedIn = computed(() => !!chat.value?.pluginSeen)

const settings = [
  { k: 'Keyframe interval', v: '2 s' },
  { k: 'Bitrate', v: '6000 Kbps CBR' },
  { k: 'Resolution', v: '1920×1080' },
  { k: 'Audio', v: 'AAC 160 Kbps' },
]
const manualOpen = ref(false)
</script>

<template>
  <UDashboardPanel id="setup">
    <template #header>
      <UDashboardNavbar title="Go live with OBS" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-2xl space-y-8 py-2">
        <div>
          <h1 class="text-display">Go live with OBS</h1>
          <p class="mt-1.5 max-w-lg text-sm text-muted">Install the LiveLoom plugin and sign in. It fills in OBS’s stream settings for you, so there’s nothing to copy.</p>
        </div>

        <HealthPanel v-if="dash.isLive.value" />

        <ol class="overflow-hidden rounded-[10px] border border-muted bg-muted/60">
          <!-- 1 -->
          <li class="flex gap-4 border-b border-muted p-5">
            <span class="grid size-6 shrink-0 place-items-center rounded-full border border-primary text-xs font-semibold text-primary">1</span>
            <div class="min-w-0 flex-1 space-y-3">
              <div>
                <p class="text-sm font-medium text-highlighted">Install the plugin</p>
                <p class="text-sm text-muted">Version {{ PLUGIN_VERSION }}, for OBS 30 or newer. Close OBS first.</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <UButton v-if="mine" :label="`Download for ${mine.os}`" :icon="mine.icon" :to="mine.url" external />
                <UButton
                  v-for="d in (mine ? others : pluginDownloads)"
                  :key="d.os"
                  :label="d.os"
                  :icon="d.icon"
                  :to="d.url"
                  external
                  color="neutral"
                  :variant="mine ? 'ghost' : 'outline'"
                />
              </div>
              <p v-if="mine" class="font-mono text-xs text-dimmed">{{ mine.hint }}</p>
            </div>
          </li>
          <!-- 2 -->
          <li class="flex gap-4 border-b border-muted p-5">
            <span
              class="grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold"
              :class="signedIn ? 'bg-primary text-white' : 'border border-accented text-muted'"
            >
              <UIcon v-if="signedIn" name="i-lucide-check" class="size-3.5" /><template v-else>2</template>
            </span>
            <div class="min-w-0 flex-1 space-y-1">
              <p class="text-sm font-medium text-highlighted">Sign in from OBS</p>
              <p class="text-sm text-muted">
                Open OBS. In the <span class="text-highlighted">Multichat</span> dock, click <span class="text-highlighted">Sign in to LiveLoom</span>, check the code matches, and click <span class="text-highlighted">Approve</span>.
              </p>
              <p class="text-xs text-dimmed">
                Browser didn’t open? Go to <ULink to="/device" class="font-mono text-toned underline">{{ origin.replace(/^https?:\/\//, '') }}/device</ULink> and enter the code.
              </p>
              <p v-if="signedIn" class="flex items-center gap-1.5 pt-1 text-sm text-success"><UIcon name="i-lucide-check" class="size-4" />OBS is signed in</p>
            </div>
          </li>
          <!-- 3 -->
          <li class="flex gap-4 p-5">
            <span
              class="grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold"
              :class="dash.isLive.value ? 'bg-primary text-white' : 'border border-accented text-muted'"
            >
              <UIcon v-if="dash.isLive.value" name="i-lucide-check" class="size-3.5" /><template v-else>3</template>
            </span>
            <div class="min-w-0 flex-1 space-y-1">
              <p class="text-sm font-medium text-highlighted">Press Start Streaming</p>
              <p class="text-sm text-muted">Every destination that’s on goes live together. LiveLoom checks your stream a few seconds later and tells you if anything needs changing.</p>
            </div>
          </li>
        </ol>

        <UiPanel title="What the plugin sets" description="LiveLoom passes your stream through untouched, so every platform gets exactly this." plain>
          <dl class="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <div v-for="s in settings" :key="s.k">
              <dt class="text-xs text-dimmed">{{ s.k }}</dt>
              <dd class="font-mono text-xs text-highlighted">{{ s.v }}</dd>
            </div>
          </dl>
        </UiPanel>

        <UCollapsible v-model:open="manualOpen">
          <UButton
            variant="ghost"
            color="neutral"
            :trailing-icon="manualOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            label="Not using the plugin? Copy your server and key"
            class="-ml-2.5"
          />
          <template #content>
            <div class="mt-3 space-y-4 rounded-[10px] border border-muted bg-muted/60 p-4">
              <p class="text-sm text-muted">OBS → Settings → Stream → Service: <span class="text-highlighted">Custom…</span></p>
              <UiCopyField label="Server" :value="channel?.ingestUrl ?? ''" />
              <UiCopyField label="Stream key" :value="channel?.ingestKey ?? ''" secret hint="Keep this private" />
            </div>
          </template>
        </UCollapsible>
      </div>
    </template>
  </UDashboardPanel>
</template>
