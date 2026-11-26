<script setup lang="ts">
import { PLATFORMS, type PlatformId } from '@sp/shared'

export interface DestinationView {
  id: string
  platform: string
  name: string
  serverUrl: string
  streamKeyHint: string
  enabled: boolean
  status: { state: string, message: string | null, bitrateKbps: number | null, startedAt: number | null }
}

const props = defineProps<{ dest: DestinationView, channelLive: boolean, now: number }>()
const emit = defineEmits<{ edit: [], toggle: [boolean], remove: [] }>()

const preset = computed(() => PLATFORMS[props.dest.platform as PlatformId] ?? PLATFORMS.custom)

const badge = computed(() => {
  const s = props.dest.status.state
  if (!props.dest.enabled) return { label: 'Off', color: 'neutral' as const }
  if (s === 'live') return { label: 'Live', color: 'success' as const }
  if (s === 'connecting') return { label: 'Connecting', color: 'info' as const }
  if (s === 'retrying') return { label: 'Reconnecting', color: 'warning' as const }
  if (s === 'error') return { label: 'Error', color: 'error' as const }
  return { label: props.channelLive ? 'Starting' : 'Ready', color: 'neutral' as const }
})
</script>

<template>
  <UCard :ui="{ body: 'p-4 sm:p-4' }" :class="!dest.enabled && 'opacity-60'">
    <div class="flex items-start gap-3">
      <div
        class="size-10 shrink-0 rounded-lg grid place-items-center"
        :style="{ backgroundColor: preset.color + '22', color: preset.color }"
      >
        <UIcon :name="platformIcon[preset.id]" class="size-5" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <p class="font-medium truncate">{{ dest.name }}</p>
          <UBadge :label="badge.label" :color="badge.color" variant="subtle" size="sm">
            <template v-if="dest.enabled && dest.status.state === 'live'" #leading>
              <span class="size-1.5 rounded-full bg-current animate-pulse" />
            </template>
          </UBadge>
        </div>
        <p class="text-xs text-muted truncate font-mono">{{ dest.serverUrl }} · {{ dest.streamKeyHint }}</p>

        <div v-if="dest.enabled && dest.status.state === 'live'" class="mt-2 flex gap-4 text-xs text-muted tabular-nums">
          <span class="flex items-center gap-1"><UIcon name="i-lucide-activity" />{{ dest.status.bitrateKbps ?? '—' }} kbps</span>
          <span v-if="dest.status.startedAt" class="flex items-center gap-1"><UIcon name="i-lucide-clock" />{{ formatDuration(now - dest.status.startedAt) }}</span>
        </div>
        <p v-else-if="dest.enabled && dest.status.message" class="mt-2 text-xs text-error break-words">{{ dest.status.message }}</p>
      </div>

      <div class="flex items-center gap-1">
        <USwitch :model-value="dest.enabled" :aria-label="`Toggle ${dest.name}`" @update:model-value="(v: boolean) => emit('toggle', v)" />
        <UDropdownMenu
          :items="[
            { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => emit('edit') },
            { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('remove') },
          ]"
        >
          <UButton icon="i-lucide-ellipsis-vertical" variant="ghost" color="neutral" size="sm" aria-label="More" />
        </UDropdownMenu>
      </div>
    </div>
  </UCard>
</template>
