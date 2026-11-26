<script setup lang="ts">
/** One sidebar row: dim by default, only the current page is highlighted. */
defineProps<{ item: { label: string, icon: string, to: string, keys?: string[], badge?: number | null, tone?: 'warning', live?: boolean }, active: boolean, collapsed?: boolean }>()
</script>

<template>
  <UTooltip :text="item.label" :kbds="item.keys" :content="{ side: 'right' }" :disabled="!collapsed">
    <NuxtLink
      :to="item.to"
      class="group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-100"
      :class="active ? 'bg-elevated font-medium text-highlighted' : 'text-muted hover:bg-elevated/60 hover:text-default'"
      :aria-current="active ? 'page' : undefined"
    >
      <UIcon :name="item.icon" class="size-4 shrink-0" :class="active ? 'text-highlighted' : 'text-dimmed group-hover:text-muted'" />
      <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
      <UiStatus v-if="item.live" tone="live" class="ml-auto" />
      <span
        v-if="!collapsed && item.badge"
        class="ml-auto min-w-5 rounded-full px-1.5 text-center text-2xs font-semibold leading-5"
        :class="item.tone === 'warning' ? 'bg-warning/15 text-warning' : 'bg-accented text-muted'"
      >{{ item.badge }}</span>
    </NuxtLink>
  </UTooltip>
</template>
