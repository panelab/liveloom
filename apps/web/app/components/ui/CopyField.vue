<script setup lang="ts">
const props = defineProps<{ label: string, value: string, secret?: boolean, hint?: string }>()
const reveal = ref(false)
const shown = computed(() => (props.secret && !reveal.value ? '•'.repeat(Math.min(props.value.length, 28)) : props.value))
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex items-baseline justify-between gap-2">
      <span class="text-sm font-medium text-toned">{{ label }}</span>
      <span v-if="hint" class="text-xs text-dimmed">{{ hint }}</span>
    </div>
    <div class="flex h-9 items-center gap-0.5 rounded-md border border-default bg-muted pl-3 pr-1">
      <code class="flex-1 truncate font-mono text-sm text-highlighted">{{ shown || '—' }}</code>
      <UTooltip v-if="secret" :text="reveal ? 'Hide' : 'Show'">
        <UButton :icon="reveal ? 'i-lucide-eye-off' : 'i-lucide-eye'" size="xs" variant="ghost" color="neutral" :aria-label="reveal ? `Hide ${label}` : `Show ${label}`" @click="reveal = !reveal" />
      </UTooltip>
      <UTooltip text="Copy">
        <UButton icon="i-lucide-copy" size="xs" variant="ghost" color="neutral" :aria-label="`Copy ${label}`" :disabled="!value" @click="copyText(value, label)" />
      </UTooltip>
      <slot name="actions" />
    </div>
  </div>
</template>
