<script setup lang="ts">
/** Inline message with an optional fix. Used for health issues, errors and tips. */
const props = withDefaults(defineProps<{ tone?: 'info' | 'success' | 'warning' | 'error', title: string, description?: string, icon?: string }>(), { tone: 'info', description: undefined, icon: undefined })
const icons = { info: 'i-lucide-info', success: 'i-lucide-circle-check', warning: 'i-lucide-triangle-alert', error: 'i-lucide-octagon-alert' }
const tones = {
  info: 'border-info/25 bg-info/5 [&_.c-icon]:text-info',
  success: 'border-success/25 bg-success/5 [&_.c-icon]:text-success',
  warning: 'border-warning/25 bg-warning/5 [&_.c-icon]:text-warning',
  error: 'border-error/25 bg-error/5 [&_.c-icon]:text-error',
}
const iconName = computed(() => props.icon ?? icons[props.tone])
</script>

<template>
  <div class="flex gap-3 rounded-md border px-3 py-2.5" :class="tones[tone]">
    <UIcon :name="iconName" class="c-icon mt-0.5 size-4 shrink-0" />
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
