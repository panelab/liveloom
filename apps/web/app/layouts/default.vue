<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { user, clear } = useUserSession()
const dash = useDashboardPolling()
const colorMode = useColorMode()

const nav = computed<NavigationMenuItem[]>(() => [
  { label: 'Overview', icon: 'i-lucide-layout-grid', to: '/' },
  {
    label: 'Destinations',
    icon: 'i-lucide-radio-tower',
    to: '/destinations',
    badge: dash.destinations.value.length ? { label: String(dash.destinations.value.length), variant: 'subtle', color: 'neutral' } : undefined,
  },
  { label: 'Studio', icon: 'i-lucide-clapperboard', to: '/studio' },
  { label: 'Chat', icon: 'i-lucide-messages-square', to: '/chat' },
  {
    label: 'Setup',
    icon: 'i-lucide-settings-2',
    to: '/setup',
    badge: dash.issues.value.length ? { label: String(dash.issues.value.length), color: 'warning', variant: 'subtle' } : undefined,
  },
])

const links: NavigationMenuItem[] = [
  { label: 'OBS plugin', icon: 'i-lucide-puzzle', to: 'https://github.com/panelab/liveloom/releases', target: '_blank' },
  { label: 'GitHub', icon: 'i-simple-icons-github', to: 'https://github.com/panelab/liveloom', target: '_blank' },
]

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
      children: [
        { label: 'Dark', icon: 'i-lucide-moon', type: 'checkbox' as const, checked: colorMode.preference === 'dark', onSelect: () => (colorMode.preference = 'dark') },
        { label: 'Light', icon: 'i-lucide-sun', type: 'checkbox' as const, checked: colorMode.preference === 'light', onSelect: () => (colorMode.preference = 'light') },
        { label: 'System', icon: 'i-lucide-monitor', type: 'checkbox' as const, checked: colorMode.preference === 'system', onSelect: () => (colorMode.preference = 'system') },
      ],
    },
    { label: 'Design system', icon: 'i-lucide-swatch-book', to: '/design' },
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: logout }],
])
</script>

<template>
  <UDashboardGroup unit="rem" storage="local">
    <UDashboardSidebar
      collapsible
      resizable
      :default-size="15"
      :min-size="13"
      :max-size="20"
      class="bg-muted"
      :ui="{ header: 'h-14', footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex min-w-0 items-center gap-2.5">
          <AppLogo :size="22" />
          <span v-if="!collapsed" class="truncate text-base font-semibold tracking-tight text-highlighted">LiveLoom</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <NuxtLink
          to="/"
          class="flex h-8 items-center gap-2 rounded-md border px-2.5 transition-colors"
          :class="dash.isLive.value ? 'border-success/30 bg-success/10' : 'border-default hover:bg-elevated'"
        >
          <UiStatus :tone="dash.isLive.value ? 'live' : 'off'" :label="collapsed ? undefined : (dash.isLive.value ? 'Live' : 'Offline')" />
          <span v-if="!collapsed && dash.isLive.value" class="ml-auto font-mono text-xs tabular-nums text-success">{{ dash.uptime.value }}</span>
        </NuxtLink>

        <UNavigationMenu :items="nav" orientation="vertical" :collapsed="collapsed" class="mt-3" />

        <div class="mt-auto">
          <p v-if="!collapsed" class="label-caps px-2.5 pb-1.5">Resources</p>
          <UNavigationMenu :items="links" orientation="vertical" :collapsed="collapsed" />
        </div>
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu :items="userMenu" :content="{ side: 'top', align: 'start' }" :ui="{ content: 'w-56' }" class="w-full">
          <UButton color="neutral" variant="ghost" block :square="collapsed" class="justify-start data-[state=open]:bg-elevated">
            <UAvatar :alt="user?.email ?? '?'" size="2xs" />
            <span v-if="!collapsed" class="truncate text-sm text-toned">{{ user?.email }}</span>
            <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="ml-auto size-3.5 text-dimmed" />
          </UButton>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
