<script setup lang="ts">
// The studio uses camera/screen APIs, so it renders in the browser. The server
// sends a placeholder with the same layout so nothing jumps when it appears.
</script>

<template>
  <ClientOnly>
    <StudioView />
    <template #fallback>
      <UDashboardPanel id="studio" :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <UDashboardNavbar title="Go live from browser" />
        </template>
        <template #body>
          <div class="grid min-h-full lg:grid-cols-[1fr_19rem]">
            <div class="space-y-3 p-4 sm:p-6">
              <div class="aspect-video rounded-[10px] bg-black ring-1 ring-(--ui-border-muted)" />
              <div class="flex gap-2"><USkeleton class="h-8 w-28" /><USkeleton class="h-8 w-24" /><USkeleton class="h-8 w-20" /></div>
            </div>
            <aside class="space-y-4 border-muted p-4 sm:p-6 lg:border-l lg:px-5">
              <USkeleton v-for="i in 4" :key="i" class="h-16 w-full" />
            </aside>
          </div>
        </template>
      </UDashboardPanel>
    </template>
  </ClientOnly>
</template>
