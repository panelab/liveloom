<script setup lang="ts">
defineProps<{ label: string, value: string, mono?: boolean, tone?: 'success' | 'warning' | 'error' }>()
</script>

<template>
  <div class="min-w-0">
    <p class="label-caps">{{ label }}</p>
    <p
      class="mt-0.5 truncate text-lg font-medium tabular-nums"
      :class="[mono && 'font-mono text-base tracking-tight', tone ? `text-${tone}` : 'text-highlighted']"
    >
      {{ value }}
    </p>
  </div>
</template>
