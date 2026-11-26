<script setup lang="ts">
/** ⌘K / "/" — every action in the app, searchable, keyboard-first. */
const open = defineModel<boolean>('open', { required: true })
const dash = useDashboard()
const dialog = useDestinationDialog()
const actions = useDestinationActions()
const colorMode = useColorMode()
const { data: channel } = useChannel()
const { data: connections } = useConnections()
const searchTerm = ref('')

function run(fn: () => unknown) {
  return () => { open.value = false; searchTerm.value = ''; fn() }
}

const groups = computed(() => [
  {
    id: 'actions',
    label: 'Actions',
    items: [
      { label: 'Add destination', icon: 'i-lucide-plus', kbds: ['C'], onSelect: run(() => dialog.add()) },
      ...(connections.value ?? []).filter((c) => c.available && !c.connected).map((c) => ({
        label: `Connect ${c.name}`, icon: platformIcon[c.platform as keyof typeof platformIcon], onSelect: run(() => { window.location.href = `/api/connect/${c.platform}` }),
      })),
      { label: 'Go live from browser', icon: 'i-lucide-monitor-up', onSelect: run(() => navigateTo('/studio')) },
      { label: 'Set up OBS', icon: 'i-simple-icons-obsstudio', onSelect: run(() => navigateTo('/setup')) },
      { label: 'Copy stream key', icon: 'i-lucide-key-round', disabled: !channel.value, onSelect: run(() => copyText(channel.value!.ingestKey, 'Stream key')) },
      { label: 'Copy server URL', icon: 'i-lucide-link', disabled: !channel.value, onSelect: run(() => copyText(channel.value!.ingestUrl, 'Server URL')) },
      {
        label: colorMode.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
        onSelect: run(() => (colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark')),
      },
    ],
  },
  {
    id: 'destinations',
    label: 'Destinations',
    items: dash.destinations.value.flatMap((d) => [
      { label: `${d.enabled ? 'Turn off' : 'Turn on'} ${d.name}`, icon: platformIcon[d.platform], suffix: d.enabled ? 'On' : 'Off', onSelect: run(() => actions.toggle(d)) },
      { label: `Edit ${d.name}`, icon: 'i-lucide-pencil', onSelect: run(() => dialog.edit(d)) },
    ]),
  },
  {
    id: 'go',
    label: 'Go to',
    items: [
      { label: 'Home', icon: 'i-lucide-house', kbds: ['G', 'H'], onSelect: run(() => navigateTo('/')) },
      { label: 'Chat', icon: 'i-lucide-messages-square', kbds: ['G', 'C'], onSelect: run(() => navigateTo('/chat')) },
      { label: 'Go live with OBS', icon: 'i-simple-icons-obsstudio', kbds: ['G', 'O'], onSelect: run(() => navigateTo('/setup')) },
      { label: 'Go live from browser', icon: 'i-lucide-monitor-up', kbds: ['G', 'B'], onSelect: run(() => navigateTo('/studio')) },
      { label: 'Settings', icon: 'i-lucide-settings', kbds: ['G', 'S'], onSelect: run(() => navigateTo('/settings')) },
    ],
  },
].filter((g) => g.items.length))
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-xl sm:top-[18%] sm:translate-y-0' }" title="Command menu" description="Search for an action or page">
    <template #content>
      <UCommandPalette
        v-model:search-term="searchTerm"
        :groups="groups"
        placeholder="Type a command or search…"
        :close="false"
        class="h-96"
        :fuse="{ resultLimit: 30 }"
        @update:open="open = $event"
      />
    </template>
  </UModal>
</template>
