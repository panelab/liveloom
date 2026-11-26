<script setup lang="ts">
import type { PlatformId } from '@sp/shared'

/** Brand icon in its brand color; `tile` adds the square background used in lists. */
withDefaults(defineProps<{ platform: PlatformId | string, tile?: boolean, size?: 'sm' | 'md' }>(), { size: 'md' })
</script>

<template>
  <span
    v-if="tile"
    class="grid shrink-0 place-items-center rounded-md border border-default bg-muted"
    :class="size === 'sm' ? 'size-7' : 'size-8'"
  >
    <UIcon :name="platformIcon[platform as PlatformId] ?? platformIcon.custom" class="size-4" :style="{ color: platformColor[platform as PlatformId] }" />
  </span>
  <UIcon
    v-else
    :name="platformIcon[platform as PlatformId] ?? platformIcon.custom"
    :class="size === 'sm' ? 'size-3.5' : 'size-4'"
    class="shrink-0"
    :style="{ color: platformColor[platform as PlatformId] }"
  />
</template>
