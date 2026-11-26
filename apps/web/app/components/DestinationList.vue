<script setup lang="ts">
/** Destinations as dense rows: platform, name, status, bitrate, on/off, menu. */
const dash = useDashboard()
const dialog = useDestinationDialog()
const actions = useDestinationActions()
</script>

<template>
  <ul>
    <li
      v-for="d in dash.destinations.value"
      :key="d.id"
      class="group row min-h-11 not-last:border-b not-last:border-muted hover:bg-elevated/50"
    >
      <UiPlatformIcon :platform="d.platform" tile />
      <button class="min-w-0 flex-1 text-left" @click="dialog.edit(d)">
        <span class="flex items-center gap-1.5">
          <span class="truncate text-sm font-medium" :class="d.enabled ? 'text-highlighted' : 'text-muted'">{{ d.name }}</span>
          <UTooltip v-if="d.connected" text="Connected account: key refreshes automatically">
            <UIcon name="i-lucide-link-2" class="size-3.5 text-dimmed" />
          </UTooltip>
        </span>
        <span
          v-if="d.enabled && d.status.message && d.status.state !== 'live'"
          class="block truncate text-xs text-error"
          :title="d.status.message"
        >{{ d.status.message }}</span>
        <span v-else class="block truncate font-mono text-2xs text-dimmed">{{ d.streamKeyHint }}</span>
      </button>
      <span class="hidden w-16 text-right font-mono text-xs tabular-nums text-muted sm:block">
        {{ d.enabled && d.status.state === 'live' ? formatKbps(d.status.bitrateKbps) : '' }}
      </span>
      <span class="hidden w-14 text-right font-mono text-xs tabular-nums text-dimmed md:block">
        {{ d.enabled && d.status.startedAt ? formatDuration(dash.now.value - d.status.startedAt) : '' }}
      </span>
      <span class="flex w-28 justify-end">
        <UiStatus v-bind="destinationStatus(d.enabled, d.status.state, dash.isLive.value)" />
      </span>
      <USwitch :model-value="d.enabled" :aria-label="`Send to ${d.name}`" @update:model-value="(v: boolean) => actions.toggle(d, v)" />
      <UDropdownMenu :items="actions.menu(d)" :content="{ align: 'end' }">
        <UButton icon="i-lucide-ellipsis" variant="ghost" color="neutral" size="xs" :aria-label="`${d.name} options`" />
      </UDropdownMenu>
    </li>
  </ul>
</template>
