<script setup lang="ts">
const accent = useAccent()
useHead({ htmlAttrs: { 'data-accent': computed(() => (accent.value === 'blue' ? undefined : accent.value)) } })
</script>

<template>
  <UApp :toaster="{ position: 'bottom-right' }" :tooltip="{ delayDuration: 200 }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
