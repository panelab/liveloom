<script setup lang="ts">
const type = [
  { cls: 'text-display', name: 'display · 26', use: 'One per page: the page headline' },
  { cls: 'text-xl font-semibold', name: 'xl · 20', use: 'Rare: big numbers' },
  { cls: 'text-base font-semibold', name: 'base · 14', use: 'Dialog titles, chat messages' },
  { cls: 'text-sm', name: 'sm · 13', use: 'Default UI text: rows, buttons, body' },
  { cls: 'text-xs', name: 'xs · 12', use: 'Metadata, mono values, section labels' },
  { cls: 'text-2xs', name: '2xs · 11', use: 'Badges, counters' },
]
const surfaces = [
  { name: 'app', cls: 'bg-surface-app', use: 'Sidebar, behind panels' },
  { name: 'bg', cls: 'bg-default', use: 'Panel' },
  { name: 'muted', cls: 'bg-muted', use: 'Grouped rows' },
  { name: 'elevated', cls: 'bg-elevated', use: 'Hover, selected' },
  { name: 'raised', cls: 'surface-raised', use: 'Menus, dialogs' },
]
const texts = [
  { name: 'highlighted', use: 'Titles, current item' },
  { name: 'default', use: 'Body' },
  { name: 'toned', use: 'Labels' },
  { name: 'muted', use: 'Descriptions' },
  { name: 'dimmed', use: 'Metadata, icons' },
]
const tones = [
  { tone: 'live', label: 'Live', shape: 'Filled' },
  { tone: 'info', label: 'Starting', shape: 'Spinning dashes' },
  { tone: 'warning', label: 'Reconnecting', shape: 'Half filled' },
  { tone: 'error', label: 'Error', shape: 'Filled with !' },
  { tone: 'idle', label: 'Ready', shape: 'Ring' },
  { tone: 'off', label: 'Off', shape: 'Dim ring' },
] as const
const principles = [
  { t: 'Grayscale first', d: 'Screens are built in greys. Color only means something: live, error, warning, or the one primary action.' },
  { t: 'Less noise', d: 'Hairline borders, no boxes inside boxes. Only the current item is highlighted.' },
  { t: 'Dense but calm', d: '13px UI text, 36px rows, a 4px spacing grid.' },
  { t: 'Elevation by lightness', d: 'Floating surfaces are lighter, with a soft shadow, never inverted.' },
  { t: 'Purposeful motion', d: '100–200ms ease-out; menus scale from where you clicked.' },
  { t: 'Keyboard first', d: '⌘K reaches every action. Shortcuts are shown in tooltips and menus.' },
]
</script>

<template>
  <UDashboardPanel id="design">
    <template #header>
      <UDashboardNavbar title="Design system" />
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-10 py-2">
        <div>
          <h1 class="text-display">Design system</h1>
          <p class="mt-1.5 max-w-lg text-sm text-muted">
            Every screen uses these tokens and components. The whole theme comes from three inputs in <code class="font-mono text-xs">main.css</code>: base hue, accent hue and contrast (OKLCH).
          </p>
        </div>

        <UiPanel title="Principles" flush>
          <ul class="grid sm:grid-cols-2">
            <li v-for="p in principles" :key="p.t" class="border-b border-muted p-4 sm:odd:border-r">
              <p class="text-sm font-medium text-highlighted">{{ p.t }}</p>
              <p class="mt-0.5 text-sm text-muted">{{ p.d }}</p>
            </li>
          </ul>
        </UiPanel>

        <UiPanel title="Typography" description="Inter (tighter tracking as size grows), JetBrains Mono for keys, URLs and numbers." flush>
          <ul>
            <li v-for="t in type" :key="t.name" class="grid grid-cols-[6.5rem_1fr] items-baseline gap-4 px-4 py-3 not-last:border-b not-last:border-muted sm:grid-cols-[6.5rem_1fr_13rem]">
              <code class="font-mono text-xs text-dimmed">{{ t.name }}</code>
              <span :class="t.cls" class="truncate text-highlighted">Stream once. Go live everywhere.</span>
              <span class="hidden text-xs text-muted sm:block">{{ t.use }}</span>
            </li>
          </ul>
        </UiPanel>

        <UiPanel title="Surfaces" description="Step up in lightness to show elevation." plain>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div v-for="s in surfaces" :key="s.name" class="overflow-hidden rounded-lg border border-muted">
              <div class="h-14" :class="s.cls" />
              <div class="border-t border-muted bg-default px-2.5 py-1.5">
                <p class="font-mono text-xs text-highlighted">{{ s.name }}</p>
                <p class="text-2xs text-dimmed">{{ s.use }}</p>
              </div>
            </div>
          </div>
        </UiPanel>

        <UiPanel title="Text" plain>
          <ul class="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <li v-for="t in texts" :key="t.name">
              <p class="text-sm font-medium" :class="`text-${t.name}`">{{ t.name }}</p>
              <p class="text-xs text-dimmed">{{ t.use }}</p>
            </li>
          </ul>
        </UiPanel>

        <UiPanel title="Status" description="Shape first, color second, so it reads without color too." flush>
          <ul class="grid grid-cols-2 sm:grid-cols-3">
            <li v-for="t in tones" :key="t.tone" class="row min-h-11 border-b border-muted">
              <UiStatus :tone="t.tone" :label="t.label" :pulse="false" />
              <span class="ml-auto text-xs text-dimmed">{{ t.shape }}</span>
            </li>
          </ul>
        </UiPanel>

        <UiPanel title="Buttons" description="One solid accent button per view. Outline for secondary, ghost for row actions." plain>
          <div class="flex flex-wrap items-center gap-2">
            <UButton label="Go live" icon="i-lucide-radio" />
            <UButton label="Secondary" variant="outline" color="neutral" />
            <UButton label="Ghost" variant="ghost" color="neutral" />
            <UButton label="Toggle on" variant="soft" color="primary" icon="i-lucide-video" />
            <UButton label="End stream" color="error" variant="soft" icon="i-lucide-square" />
            <UTooltip text="Add destination" :kbds="['C']">
              <UButton icon="i-lucide-plus" variant="ghost" color="neutral" aria-label="Add" />
            </UTooltip>
          </div>
        </UiPanel>

        <UiPanel title="Rows" flush>
          <ul>
            <li v-for="p in (['youtube', 'twitch', 'kick'] as const)" :key="p" class="row min-h-11 not-last:border-b not-last:border-muted">
              <UiPlatformIcon :platform="p" tile />
              <span class="flex-1 text-sm font-medium text-highlighted">{{ PLATFORM_NAMES[p] }}</span>
              <span class="font-mono text-xs text-muted">6.1 Mbps</span>
              <UiStatus tone="live" label="Live" :pulse="false" />
            </li>
          </ul>
        </UiPanel>

        <UiPanel title="Callouts" description="Say what happened and what to do. Color only on the icon." plain>
          <div class="space-y-2">
            <UiCallout tone="success" title="Everything looks good" description="Your settings work on every platform." />
            <UiCallout tone="warning" title="Keyframe every 4.2 s" description="Set Keyframe Interval to 2 in OBS → Settings → Output." />
            <UiCallout tone="error" title="Couldn’t connect" description="Kick did not return a stream key." />
          </div>
        </UiPanel>

        <UiPanel title="Copy field" plain>
          <UiCopyField label="Stream key" value="live_8f2a9c1e7b" secret />
        </UiPanel>
      </div>
    </template>
  </UDashboardPanel>
</template>
