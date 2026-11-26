<script setup lang="ts">
/**
 * Status by shape first, color second (works for color-blind users and in
 * greyscale): empty ring = off/ready, dashed ring = starting, half = reconnecting,
 * filled = live, ring with ! = error.
 */
export type StatusTone = 'live' | 'info' | 'warning' | 'error' | 'idle' | 'off'

const props = withDefaults(defineProps<{ tone: StatusTone, label?: string, pulse?: boolean }>(), { label: undefined, pulse: undefined })

const color: Record<StatusTone, string> = {
  live: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  error: 'text-error',
  idle: 'text-muted',
  off: 'text-dimmed',
}
const animate = computed(() => props.pulse ?? props.tone === 'live')
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-xs font-medium" :class="color[tone]">
    <svg viewBox="0 0 14 14" class="size-3.5 shrink-0" aria-hidden="true">
      <template v-if="tone === 'live'">
        <circle v-if="animate" cx="7" cy="7" r="6" fill="currentColor" opacity="0.25" class="origin-center animate-ping [animation-duration:1.6s]" />
        <circle cx="7" cy="7" r="5" fill="currentColor" />
        <circle cx="7" cy="7" r="2" fill="var(--ui-bg)" />
      </template>
      <template v-else-if="tone === 'info'">
        <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.2 1.9" class="origin-center animate-[spin_3s_linear_infinite]" />
      </template>
      <template v-else-if="tone === 'warning'">
        <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
      </template>
      <template v-else-if="tone === 'error'">
        <circle cx="7" cy="7" r="6" fill="currentColor" />
        <path d="M7 3.8v3.6" stroke="var(--ui-bg)" stroke-width="1.6" stroke-linecap="round" />
        <circle cx="7" cy="9.9" r="0.9" fill="var(--ui-bg)" />
      </template>
      <template v-else>
        <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5" />
      </template>
    </svg>
    <span v-if="label" :class="tone === 'off' || tone === 'idle' ? '' : ''">{{ label }}</span>
  </span>
</template>
