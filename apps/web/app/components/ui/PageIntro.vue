<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <div class="flex items-center gap-2.5">
        <slot name="leading" />
        <h1 class="text-xl font-semibold tracking-tight text-highlighted">{{ title }}</h1>
      </div>
      <p v-if="description" class="mt-1 max-w-2xl text-sm text-muted">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
