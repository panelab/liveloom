<script setup lang="ts">
// Destinations now live on Home; keep old links (and OAuth returns) working.
const route = useRoute()
await navigateTo({ path: '/', query: route.query }, { replace: true })
</script>

<template>
  <div />
</template>
