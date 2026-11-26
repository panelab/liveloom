<script setup lang="ts">
export interface Step { title: string, description?: string, done: boolean, to?: string, cta?: string, onClick?: () => void }
const props = defineProps<{ steps: Step[] }>()
/** Only the first unfinished step gets a solid button, so there's always one obvious next action. */
const current = computed(() => props.steps.findIndex((s) => !s.done))
</script>

<template>
  <ol>
    <li v-for="(s, i) in steps" :key="s.title" class="flex items-center gap-3 px-4 py-3 not-last:border-b not-last:border-muted">
      <span
        class="grid size-5 shrink-0 place-items-center rounded-full text-2xs font-semibold"
        :class="s.done ? 'bg-primary text-white' : i === current ? 'border border-primary text-primary' : 'border border-accented text-dimmed'"
      >
        <UIcon v-if="s.done" name="i-lucide-check" class="size-3" />
        <template v-else>{{ i + 1 }}</template>
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium" :class="s.done ? 'text-dimmed line-through decoration-(--ui-border-accented)' : 'text-highlighted'">{{ s.title }}</p>
        <p v-if="s.description && !s.done" class="text-sm text-muted">{{ s.description }}</p>
      </div>
      <UButton
        v-if="!s.done && (s.to || s.onClick)"
        :label="s.cta ?? 'Start'"
        :to="s.to"
        :variant="i === current ? 'solid' : 'ghost'"
        :color="i === current ? 'primary' : 'neutral'"
        size="xs"
        @click="s.onClick?.()"
      />
    </li>
  </ol>
</template>
