<script setup lang="ts">
/**
 * A titled section. The title sits outside the box (Linear settings style);
 * the box is a hairline-bordered container. `flush` = rows go edge to edge.
 * `plain` = no box at all, just the heading and content.
 */
defineProps<{ title?: string, description?: string, flush?: boolean, plain?: boolean }>()
</script>

<template>
  <section>
    <header v-if="title || $slots.actions" class="mb-2 flex min-h-7 items-end justify-between gap-4">
      <div class="min-w-0">
        <h2 v-if="title" class="text-sm font-medium text-highlighted">{{ title }}</h2>
        <p v-if="description" class="mt-0.5 text-sm text-muted">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1">
        <slot name="actions" />
      </div>
    </header>
    <div v-if="plain">
      <slot />
    </div>
    <div v-else class="overflow-hidden rounded-[10px] border border-muted bg-muted/60" :class="flush ? '' : 'p-4'">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="mt-2 text-xs text-dimmed">
      <slot name="footer" />
    </footer>
  </section>
</template>
