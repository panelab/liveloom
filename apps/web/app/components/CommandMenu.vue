<script setup lang="ts">
/** ⌘K / "/" — every action in the app, searchable, keyboard-first. */
const open = defineModel<boolean>('open', { required: true })
const dash = useDashboard()
const dialog = useDestinationDialog()
const actions = useDestinationActions()
const colorMode = useColorMode()
const route = useRoute()
const { data: channel } = useChannel()
const { data: connections } = useConnections()
const searchTerm = ref('')
watch(open, (o) => { if (!o) searchTerm.value = '' })

function run(fn: () => unknown) {
  return () => { open.value = false; fn() }
}
const go = (to: string) => run(() => navigateTo(to))

const groups = computed(() => {
  const here = route.path
  return [
    {
      id: 'actions',
      label: 'Actions',
      items: [
        { label: 'Add destination', icon: 'i-lucide-plus', kbds: ['C'], onSelect: run(() => dialog.add()) },
        { label: 'Edit stream title and details', icon: 'i-lucide-type', onSelect: go('/#stream-details') },
        ...(connections.value ?? []).filter((c) => c.available && !c.connected).map((c) => ({
          label: `Connect ${c.name}`, icon: platformIcon[c.platform as keyof typeof platformIcon], onSelect: run(() => { window.location.href = `/api/connect/${c.platform}` }),
        })),
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
      id: 'go',
      label: 'Go to',
      items: [
        { label: 'Home', icon: 'i-lucide-house', kbds: ['G', 'H'], to: '/' },
        { label: 'Chat', icon: 'i-lucide-messages-square', kbds: ['G', 'C'], to: '/chat' },
        { label: 'Go live with OBS', icon: 'i-simple-icons-obsstudio', kbds: ['G', 'O'], to: '/setup' },
        { label: 'Go live from browser', icon: 'i-lucide-monitor-up', kbds: ['G', 'B'], to: '/studio' },
        { label: 'Settings', icon: 'i-lucide-settings', kbds: ['G', 'S'], to: '/settings' },
      ].filter((i) => i.to !== here).map(({ to, ...i }) => ({ ...i, onSelect: go(to) })),
    },
    {
      id: 'destinations',
      label: 'Destinations',
      items: dash.destinations.value.flatMap((d) => [
        { label: `${d.enabled ? 'Turn off' : 'Turn on'} ${d.name}`, icon: platformIcon[d.platform], suffix: d.enabled ? 'On now' : 'Off now', onSelect: run(() => actions.toggle(d)) },
        { label: `Edit ${d.name}`, icon: 'i-lucide-pencil', onSelect: run(() => dialog.edit(d)) },
      ]),
    },
  ].filter((g) => g.items.length)
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Command menu"
    description="Search for an action or page"
    :ui="{
      overlay: 'bg-black/40 backdrop-blur-none',
      content: 'top-[14vh] translate-y-0 w-[calc(100vw-2rem)] max-w-[620px] max-h-none rounded-xl overflow-hidden',
    }"
  >
    <template #content>
      <UCommandPalette
        v-model:search-term="searchTerm"
        :groups="groups"
        placeholder="Type a command or search…"
        :close="false"
        icon="i-lucide-search"
        :fuse="{ resultLimit: 40, fuseOptions: { threshold: 0.25, ignoreLocation: true, keys: ['label', 'suffix'] } }"
        :ui="{
          root: 'divide-y divide-muted',
          input: '[&>input]:h-12 [&>input]:text-[15px] [&>input]:px-4 [&>input]:ps-11 border-0 [&>input]:focus-visible:ring-0 [&>input]:ring-0',
          viewport: 'h-[min(380px,55vh)] overflow-y-auto overscroll-contain',
          group: 'p-1.5',
          label: 'px-2.5 pt-2 pb-1 text-xs font-medium text-dimmed',
          item: 'items-center px-2.5 py-2 text-sm',
          itemLeadingIcon: 'size-4 shrink-0',
          itemLabelSuffix: 'text-dimmed',
          itemTrailingKbds: 'gap-1',
          empty: 'py-10 text-sm text-dimmed',
        }"
      >
        <template #footer>
          <div class="flex items-center gap-4 px-3 py-2 text-xs text-dimmed">
            <span class="flex items-center gap-1"><UKbd value="↑" /><UKbd value="↓" />to move</span>
            <span class="flex items-center gap-1"><UKbd value="↵" />to select</span>
            <span class="ml-auto flex items-center gap-1"><UKbd value="esc" />to close</span>
          </div>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
