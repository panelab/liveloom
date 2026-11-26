<script setup lang="ts">
/** Inline message: what happened and what to do. Color only on the icon. */
const props = withDefaults(defineProps<{ tone?: 'info' | 'success' | 'warning' | 'error', title: string, description?: string, icon?: string }>(), { tone: 'info', description: undefined, icon: undefined })
const icons = { info: 'i-lucide-info', success: 'i-lucide-circle-check', warning: 'i-lucide-triangle-alert', error: 'i-lucide-circle-alert' }
const tones = { info: 'text-info', success: 'text-success', warning: 'text-warning', error: 'text-error' }
const edge = { info: 'border-muted', success: 'border-muted', warning: 'border-warning/25', error: 'border-error/30' }
const iconName = computed(() => props.icon ?? icons[props.tone])
</script>

<template>
  <div class="flex gap-2.5 rounded-lg border bg-muted/60 px-3 py-2.5" :class="edge[tone]">
    <UIcon :name="iconName" class="mt-0.5 size-4 shrink-0" :class="tones[tone]" />
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-highlighted">{{ title }}</p>
      <p v-if="description" class="mt-0.5 text-sm text-muted">{{ description }}</p>
      <slot />
    </div>
    <div v-if="$slots.actions" class="shrink-0 self-center">
      <slot name="actions" />
    </div>
  </div>
</template>
