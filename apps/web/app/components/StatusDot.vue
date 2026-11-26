<script setup lang="ts">
defineProps<{ color: string, pulse?: boolean }>()
</script>

<template>
  <span class="relative inline-flex size-2 shrink-0">
    <span v-if="pulse" class="absolute inline-flex size-full rounded-full opacity-60 animate-ping" :class="color" />
    <span class="relative inline-flex size-2 rounded-full" :class="color" />
  </span>
</template>
