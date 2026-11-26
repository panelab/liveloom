<script setup lang="ts">
/** The one container for grouped content. `flush` removes body padding (tables, lists). */
defineProps<{ title?: string, description?: string, flush?: boolean }>()
</script>

<template>
  <section class="rounded-lg border border-default bg-elevated/30">
    <header v-if="title || $slots.actions" class="flex items-start justify-between gap-4 border-b border-default px-4 py-3">
      <div class="min-w-0">
        <h2 v-if="title" class="text-base font-medium text-highlighted">{{ title }}</h2>
        <p v-if="description" class="mt-0.5 text-sm text-muted">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div :class="flush ? '' : 'p-4'">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="border-t border-default px-4 py-3">
      <slot name="footer" />
    </footer>
  </section>
</template>
