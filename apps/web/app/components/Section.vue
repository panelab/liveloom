<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <section class="rounded-lg border border-default bg-elevated/40">
    <header class="flex items-start justify-between gap-4 px-4 py-3 border-b border-default">
      <div class="min-w-0">
        <h2 class="text-sm font-medium text-highlighted">{{ title }}</h2>
        <p v-if="description" class="mt-0.5 text-xs text-muted">{{ description }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div class="p-4">
      <slot />
    </div>
  </section>
</template>
