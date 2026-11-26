<script setup lang="ts">
export interface Step { title: string, description?: string, done: boolean, to?: string, cta?: string, onClick?: () => void }
defineProps<{ steps: Step[] }>()
</script>

<template>
  <ol class="divide-y divide-default">
    <li v-for="(s, i) in steps" :key="s.title" class="flex items-center gap-3 px-4 py-3">
      <span
        class="grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium"
        :class="s.done ? 'border-success/40 bg-success/10 text-success' : 'border-default text-muted'"
      >
        <UIcon v-if="s.done" name="i-lucide-check" class="size-3.5" />
        <template v-else>{{ i + 1 }}</template>
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium" :class="s.done ? 'text-muted' : 'text-highlighted'">{{ s.title }}</p>
        <p v-if="s.description" class="text-sm text-dimmed">{{ s.description }}</p>
      </div>
      <UButton
        v-if="!s.done && (s.to || s.onClick)"
        :label="s.cta ?? 'Start'"
        :to="s.to"
        variant="outline"
        color="neutral"
        size="xs"
        trailing-icon="i-lucide-arrow-right"
        @click="s.onClick?.()"
      />
    </li>
  </ol>
</template>
