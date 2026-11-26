<script setup lang="ts">
/** Dot + label. The only way status is shown, so colors mean the same thing everywhere. */
export type StatusTone = 'live' | 'info' | 'warning' | 'error' | 'idle' | 'off'

const props = withDefaults(defineProps<{ tone: StatusTone, label?: string, pulse?: boolean }>(), { label: undefined, pulse: undefined })

const dot: Record<StatusTone, string> = {
  live: 'bg-success',
  info: 'bg-info',
  warning: 'bg-warning',
  error: 'bg-error',
  idle: 'bg-(--ui-text-muted)',
  off: 'bg-(--ui-text-dimmed)',
}
const text: Record<StatusTone, string> = {
  live: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  error: 'text-error',
  idle: 'text-muted',
  off: 'text-dimmed',
}
const animate = computed(() => props.pulse ?? (props.tone === 'live' || props.tone === 'info'))
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-xs font-medium" :class="text[tone]">
    <span class="relative inline-flex size-2 shrink-0">
      <span v-if="animate" class="absolute inline-flex size-full animate-ping rounded-full opacity-50" :class="dot[tone]" />
      <span class="relative inline-flex size-2 rounded-full" :class="dot[tone]" />
    </span>
    <span v-if="label">{{ label }}</span>
  </span>
</template>
