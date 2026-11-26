<script setup lang="ts">
import type { PlatformId } from '@sp/shared'

/** Brand icon in its brand color (the one place brand colors appear); `tile` adds a quiet square. */
withDefaults(defineProps<{ platform: PlatformId | string, tile?: boolean, size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })
</script>

<template>
  <span
    v-if="tile"
    class="grid shrink-0 place-items-center rounded-md bg-elevated"
    :class="{ sm: 'size-6', md: 'size-7', lg: 'size-9' }[size]"
  >
    <UIcon :name="platformIcon[platform as PlatformId] ?? platformIcon.custom" :class="size === 'lg' ? 'size-5' : 'size-3.5'" :style="{ color: platformColor[platform as PlatformId] }" />
  </span>
  <UIcon
    v-else
    :name="platformIcon[platform as PlatformId] ?? platformIcon.custom"
    :class="size === 'sm' ? 'size-3.5' : 'size-4'"
    class="shrink-0"
    :style="{ color: platformColor[platform as PlatformId] }"
  />
</template>
