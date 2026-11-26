<script setup lang="ts">
/** Stream health: what the relay measured and exactly what to change in OBS. */
const props = defineProps<{ compact?: boolean }>()
const dash = useDashboard()
const h = computed(() => dash.health.value)
const facts = computed(() => {
  const v = h.value?.video
  const a = h.value?.audio
  return [
    { k: 'Resolution', v: v ? `${v.width}×${v.height}` : '—' },
    { k: 'Frame rate', v: v ? `${Math.round(v.fps)} fps` : '—' },
    { k: 'Keyframes', v: v?.keyframeInterval ? `every ${v.keyframeInterval.toFixed(1)} s` : '—' },
    { k: 'Bitrate', v: formatKbps(h.value?.totalKbps) },
    { k: 'Codecs', v: v ? `${v.codec.toUpperCase()} · ${a?.codec.toUpperCase() ?? 'no audio'}` : '—' },
  ]
})
const checkedAgo = computed(() => (h.value ? Math.max(0, Math.round((dash.now.value - h.value.checkedAt) / 1000)) : null))
</script>

<template>
  <UiPanel title="Stream health" :description="props.compact ? undefined : 'LiveLoom checks what you send against every platform you stream to.'">
    <template #actions>
      <span v-if="checkedAgo !== null" class="text-xs text-dimmed">Checked {{ checkedAgo < 60 ? `${checkedAgo}s` : `${Math.round(checkedAgo / 60)}m` }} ago</span>
    </template>

    <div v-if="!dash.isLive.value" class="flex items-center gap-3 text-sm text-muted">
      <UIcon name="i-lucide-activity" class="size-4 text-dimmed" />
      Health checks run automatically a few seconds after you go live.
    </div>
    <div v-else-if="!h" class="flex items-center gap-3 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-dimmed" />
      Measuring your stream…
    </div>
    <div v-else class="space-y-4">
      <dl
        class="grid overflow-hidden rounded-md border border-default divide-default"
        :class="props.compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-5 sm:divide-x'"
      >
        <div v-for="f in facts" :key="f.k" class="px-3 py-2" :class="props.compact && f.k === 'Codecs' && 'col-span-2'">
          <dt class="text-2xs text-dimmed">{{ f.k }}</dt>
          <dd class="font-mono text-xs text-highlighted">{{ f.v }}</dd>
        </div>
      </dl>
      <UiCallout v-if="!dash.issues.value.length" tone="success" title="Everything looks good" description="Your settings work on every platform you're streaming to." />
      <div v-else class="space-y-2">
        <UiCallout
          v-for="i in dash.issues.value"
          :key="i.id"
          :tone="i.level === 'error' ? 'error' : i.level === 'warning' ? 'warning' : 'info'"
          :title="i.title"
          :description="i.fix"
        />
      </div>
    </div>
  </UiPanel>
</template>
