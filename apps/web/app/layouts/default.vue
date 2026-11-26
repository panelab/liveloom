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
    badge: dash.destinations.value.length ? String(dash.destinations.value.length) : undefined,
  },
  { label: 'Chat', icon: 'i-lucide-messages-square', to: '/chat' },
  { label: 'Setup', icon: 'i-lucide-settings-2', to: '/setup' },
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
  [{
    label: colorMode.value === 'dark' ? 'Light theme' : 'Dark theme',
    icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
    onSelect: () => { colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark' },
  }],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: logout }],
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
      class="bg-muted/60"
      :ui="{ footer: 'border-t border-default', header: 'h-12' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex items-center gap-2 min-w-0">
          <img src="/icon.svg" alt="" class="size-5 shrink-0 rounded">
          <span v-if="!collapsed" class="font-semibold tracking-tight text-highlighted truncate">LiveLoom</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <!-- live pill -->
        <NuxtLink
          to="/"
          class="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
          :class="dash.isLive.value ? 'border-success/30 bg-success/10 text-success' : 'border-default text-muted hover:bg-elevated'"
        >
          <StatusDot :color="dash.isLive.value ? 'bg-success' : 'bg-(--ui-text-dimmed)'" :pulse="dash.isLive.value" />
          <template v-if="!collapsed">
            <span class="font-medium">{{ dash.isLive.value ? 'Live' : 'Offline' }}</span>
            <span v-if="dash.isLive.value" class="ml-auto font-mono tabular-nums">{{ dash.uptime.value }}</span>
          </template>
        </NuxtLink>

        <UNavigationMenu :items="nav" orientation="vertical" :collapsed="collapsed" highlight class="mt-2" />

        <div class="mt-auto">
          <p v-if="!collapsed" class="section-label px-2.5 pb-1">Resources</p>
          <UNavigationMenu :items="links" orientation="vertical" :collapsed="collapsed" />
        </div>
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu :items="userMenu" :content="{ side: 'top', align: 'start' }" class="w-full">
          <UButton
            color="neutral"
            variant="ghost"
            block
            :square="collapsed"
            class="justify-start data-[state=open]:bg-elevated"
          >
            <span class="grid size-5 shrink-0 place-items-center rounded bg-accented text-[10px] font-semibold uppercase text-highlighted">
              {{ user?.email?.[0] ?? '?' }}
            </span>
            <span v-if="!collapsed" class="truncate text-xs text-muted">{{ user?.email }}</span>
            <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="ml-auto size-3.5 text-dimmed" />
          </UButton>
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
