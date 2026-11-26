<script setup lang="ts">
const { user, clear } = useUserSession()
const dash = await useDashboardPolling()
const colorMode = useColorMode()
const route = useRoute()
const dialog = useDestinationDialog()
const commandOpen = useState('command-open', () => false)

interface NavItem { label: string, icon: string, to: string, keys?: string[], badge?: number | null, tone?: 'warning', live?: boolean }

// Browser stream running in this tab (keeps going while you use other pages).
const studioState = computed(() => (import.meta.client ? studioSession()?.state.value ?? 'idle' : 'idle'))
const studioRecording = computed(() => (import.meta.client ? !!studioSession()?.recording.value : false))
const studioOn = computed(() => studioState.value !== 'idle' || studioRecording.value)
const primary = computed<NavItem[]>(() => [
  { label: 'Home', icon: 'i-lucide-house', to: '/', keys: ['G', 'H'], badge: dash.issues.value.length || null, tone: 'warning' },
  { label: 'Chat', icon: 'i-lucide-messages-square', to: '/chat', keys: ['G', 'C'] },
])
const goLive = computed<NavItem[]>(() => [
  { label: 'With OBS', icon: 'i-simple-icons-obsstudio', to: '/setup', keys: ['G', 'O'] },
  { label: 'From browser', icon: 'i-lucide-monitor-up', to: '/studio', keys: ['G', 'B'], live: studioOn.value },
])
const secondary: NavItem[] = [
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings', keys: ['G', 'S'] },
]
const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}

const userMenu = computed(() => [
  [{ label: user.value?.email ?? '', type: 'label' as const }],
  [
    {
      label: 'Theme',
      icon: colorMode.value === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun',
      children: (['dark', 'light', 'system'] as const).map((m) => ({
        label: m[0]!.toUpperCase() + m.slice(1),
        icon: { dark: 'i-lucide-moon', light: 'i-lucide-sun', system: 'i-lucide-monitor' }[m],
        type: 'checkbox' as const,
        checked: colorMode.preference === m,
        onSelect: () => (colorMode.preference = m),
      })),
    },
    { label: 'Keyboard shortcuts', icon: 'i-lucide-keyboard', to: '/settings#shortcuts' },
    { label: 'Design system', icon: 'i-lucide-swatch-book', to: '/design' },
    { label: 'Get the OBS plugin', icon: 'i-lucide-puzzle', to: 'https://github.com/panelab/liveloom/releases', target: '_blank' },
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: logout }],
])

defineShortcuts({
  meta_k: () => (commandOpen.value = !commandOpen.value),
  '/': () => (commandOpen.value = true),
  c: () => dialog.add(),
  'g-h': () => navigateTo('/'),
  'g-c': () => navigateTo('/chat'),
  'g-o': () => navigateTo('/setup'),
  'g-b': () => navigateTo('/studio'),
  'g-s': () => navigateTo('/settings'),
})
</script>

<template>
  <UDashboardGroup unit="rem" storage="local" class="bg-surface-app">
    <UDashboardSidebar collapsible resizable :default-size="14" :min-size="12" :max-size="18">
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex min-w-0 items-center gap-2 rounded-md px-1 py-1">
          <AppLogo :size="20" />
          <span v-if="!collapsed" class="truncate text-sm font-semibold tracking-tight text-highlighted">LiveLoom</span>
        </NuxtLink>
        <div v-if="!collapsed" class="ml-auto flex items-center">
          <UTooltip text="Search and commands" :kbds="['meta', 'K']">
            <UButton icon="i-lucide-search" variant="ghost" color="neutral" size="sm" aria-label="Search and commands" @click="commandOpen = true" />
          </UTooltip>
          <UTooltip text="Add destination" :kbds="['C']">
            <UButton icon="i-lucide-plus" variant="ghost" color="neutral" size="sm" aria-label="Add destination" @click="dialog.add()" />
          </UTooltip>
        </div>
      </template>

      <template #default="{ collapsed }">
        <NuxtLink
          to="/"
          class="mb-3 flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors"
          :class="dash.isLive.value ? 'bg-success/10 text-success' : 'text-muted hover:bg-elevated'"
        >
          <UiStatus :tone="dash.isLive.value ? 'live' : 'off'" />
          <template v-if="!collapsed">
            <span class="font-medium">{{ dash.isLive.value ? 'Live' : 'Offline' }}</span>
            <span v-if="dash.isLive.value" class="ml-auto font-mono text-xs tabular-nums">{{ dash.uptime.value }}</span>
          </template>
        </NuxtLink>

        <nav class="space-y-px" aria-label="Main">
          <SidebarLink v-for="i in primary" :key="i.to" :item="i" :active="isActive(i.to)" :collapsed="collapsed" />
        </nav>

        <p v-if="!collapsed" class="mb-1 mt-5 px-2 text-xs font-medium text-dimmed">Go live</p>
        <USeparator v-else class="my-3" />
        <nav class="space-y-px" aria-label="Go live">
          <SidebarLink v-for="i in goLive" :key="i.to" :item="i" :active="isActive(i.to)" :collapsed="collapsed" />
        </nav>

        <nav class="mt-auto space-y-px pt-4" aria-label="Settings">
          <SidebarLink v-for="i in secondary" :key="i.to" :item="i" :active="isActive(i.to)" :collapsed="collapsed" />
        </nav>
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu :items="userMenu" :content="{ side: 'top', align: 'start' }" class="w-full">
          <UButton color="neutral" variant="ghost" block :square="collapsed" class="justify-start px-2 data-[state=open]:bg-elevated">
            <UAvatar :alt="user?.email ?? '?'" size="3xs" />
            <span v-if="!collapsed" class="truncate text-sm text-toned">{{ user?.email }}</span>
          </UButton>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <slot />

    <!-- Browser stream keeps running on other pages: always show a way back -->
    <NuxtLink
      v-if="studioOn && route.path !== '/studio'"
      to="/studio"
      class="surface-raised fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-highlighted"
    >
      <UiStatus :tone="studioState === 'live' ? 'live' : studioState === 'idle' ? 'error' : 'warning'" />
      {{ studioState === 'live' ? 'Live from this tab' : studioState === 'idle' ? 'Recording in this tab' : 'Reconnecting…' }}
      <span class="text-muted">· Open Studio</span>
    </NuxtLink>

    <CommandMenu v-model:open="commandOpen" />
    <DestinationModal />
  </UDashboardGroup>
</template>
