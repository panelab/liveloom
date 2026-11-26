<script setup lang="ts">
defineProps<{ label: string, value: string, mono?: boolean, tone?: 'success' | 'warning' | 'error' }>()
</script>

<template>
  <div class="px-4 py-3">
    <p class="label-caps">{{ label }}</p>
    <p
      class="mt-1 text-xl font-semibold tabular-nums"
      :class="[mono && 'font-mono tracking-tight', tone ? `text-${tone}` : 'text-highlighted']"
    >
      {{ value }}
    </p>
  </div>
</template>
