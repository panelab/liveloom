<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 20 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="0.5" y="0.5" width="23" height="23" rx="6" class="fill-(--ui-bg-elevated) stroke-(--ui-border-accented)" />
    <path d="M5.5 8.5h13M5.5 15.5h13" class="stroke-(--ui-text-dimmed)" stroke-width="1.6" stroke-linecap="round" />
    <path d="M8.5 5.5v13M15.5 5.5v13" class="stroke-(--ui-text-highlighted)" stroke-width="1.6" stroke-linecap="round" />
    <path d="M5.5 12h13" stroke="var(--ui-primary)" stroke-width="1.8" stroke-linecap="round" />
  </svg>
</template>
