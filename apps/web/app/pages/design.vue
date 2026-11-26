<script setup lang="ts">
const type = [
  { cls: 'text-2xl font-semibold tracking-tight', name: '2xl · 24', use: 'Rare, hero numbers' },
  { cls: 'text-xl font-semibold tracking-tight', name: 'xl · 20', use: 'Page titles, stats' },
  { cls: 'text-lg font-medium', name: 'lg · 16', use: 'Dialog titles' },
  { cls: 'text-base', name: 'base · 14', use: 'Body, chat messages' },
  { cls: 'text-sm', name: 'sm · 13', use: 'Descriptions, list rows, labels' },
  { cls: 'text-xs', name: 'xs · 12', use: 'Metadata, mono values' },
  { cls: 'label-caps', name: '2xs · 11 caps', use: 'Stat labels, table headers' },
]
const surfaces = [
  { name: 'bg', cls: 'bg-default' },
  { name: 'muted', cls: 'bg-muted' },
  { name: 'elevated', cls: 'bg-elevated' },
  { name: 'accented', cls: 'bg-accented' },
]
const texts = ['highlighted', 'default', 'toned', 'muted', 'dimmed']
const tones = ['live', 'info', 'warning', 'error', 'idle', 'off'] as const
</script>

<template>
  <UDashboardPanel id="design">
    <template #header>
      <UDashboardNavbar title="Design system" :ui="{ root: 'h-14' }" />
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-4xl space-y-6">
        <UiPageIntro title="Design system" description="Every screen is built from these tokens and components. Use them instead of one-off sizes, colors or markup." />

        <UiPanel title="Typography" description="Inter for UI, JetBrains Mono for keys, URLs and numbers." flush>
          <ul class="divide-y divide-default">
            <li v-for="t in type" :key="t.name" class="grid grid-cols-[7rem_1fr] items-baseline gap-4 px-4 py-3 sm:grid-cols-[7rem_1fr_14rem]">
              <code class="font-mono text-xs text-dimmed">{{ t.name }}</code>
              <span :class="t.cls" class="truncate text-highlighted">Stream once. Go live everywhere.</span>
              <span class="hidden text-xs text-muted sm:block">{{ t.use }}</span>
            </li>
            <li class="grid grid-cols-[7rem_1fr] items-baseline gap-4 px-4 py-3">
              <code class="font-mono text-xs text-dimmed">mono</code>
              <span class="font-mono text-sm text-highlighted">rtmp://stream.discerns.app:1935/live · 6000 Kbps</span>
            </li>
          </ul>
        </UiPanel>

        <UiPanel title="Color" description="Surfaces step up in lightness; text steps down in emphasis. One brand accent, used sparingly.">
          <div class="space-y-5">
            <div>
              <p class="label-caps mb-2">Surfaces</p>
              <div class="grid grid-cols-4 gap-2">
                <div v-for="s in surfaces" :key="s.name" class="overflow-hidden rounded-md border border-default">
                  <div class="h-12" :class="s.cls" />
                  <p class="border-t border-default px-2 py-1 font-mono text-xs text-muted">{{ s.name }}</p>
                </div>
              </div>
            </div>
            <div>
              <p class="label-caps mb-2">Text</p>
              <div class="flex flex-wrap gap-x-6 gap-y-1">
                <span v-for="t in texts" :key="t" :class="`text-${t}`" class="text-sm">{{ t }}</span>
              </div>
            </div>
            <div>
              <p class="label-caps mb-2">Brand & status</p>
              <div class="flex flex-wrap items-center gap-4">
                <span class="flex items-center gap-2 text-sm text-muted"><span class="size-4 rounded bg-brand" />brand</span>
                <UiStatus v-for="t in tones" :key="t" :tone="t" :label="t" :pulse="false" />
              </div>
            </div>
          </div>
        </UiPanel>

        <UiPanel title="Buttons" description="One solid primary per view. Outline for secondary actions, ghost for row actions.">
          <div class="flex flex-wrap items-center gap-2">
            <UButton label="Primary" icon="i-lucide-plus" />
            <UButton label="Secondary" variant="outline" color="neutral" />
            <UButton label="Ghost" variant="ghost" color="neutral" />
            <UButton label="Destructive" color="error" variant="soft" icon="i-lucide-trash-2" />
            <UButton icon="i-lucide-ellipsis" variant="ghost" color="neutral" aria-label="More" />
          </div>
        </UiPanel>

        <div class="grid gap-6 sm:grid-cols-2">
          <UiPanel title="Stats" flush>
            <div class="grid grid-cols-2 divide-x divide-default">
              <UiStat label="Uptime" value="1:24:09" mono />
              <UiStat label="Status" value="Live" tone="success" />
            </div>
          </UiPanel>
          <UiPanel title="Copy field">
            <UiCopyField label="Stream key" value="live_8f2a9c1e7b" secret />
          </UiPanel>
        </div>

        <UiPanel title="Callouts" description="For health issues, errors and tips: say what happened and what to do.">
          <div class="space-y-2">
            <UiCallout tone="success" title="Everything looks good" description="Your settings work on every platform." />
            <UiCallout tone="warning" title="Keyframe every 4.2 s" description="Set Keyframe Interval to 2 in OBS → Settings → Output." />
            <UiCallout tone="error" title="Couldn’t connect" description="Kick did not return a stream key." />
          </div>
        </UiPanel>

        <UiPanel title="List rows" flush>
          <ul class="divide-y divide-default">
            <li v-for="p in (['youtube', 'twitch', 'kick'] as const)" :key="p" class="flex items-center gap-3 px-4 py-2.5">
              <UiPlatformIcon :platform="p" tile size="sm" />
              <span class="flex-1 text-sm capitalize text-highlighted">{{ p }}</span>
              <span class="font-mono text-xs text-muted">6.1 Mbps</span>
              <UiStatus tone="live" label="Live" />
            </li>
          </ul>
        </UiPanel>
      </div>
    </template>
  </UDashboardPanel>
</template>
