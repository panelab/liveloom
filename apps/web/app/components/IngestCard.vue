<script setup lang="ts">
const props = defineProps<{ ingestUrl: string, ingestKey: string, isLive: boolean }>()
const emit = defineEmits<{ rotated: [] }>()
const toast = useToast()
const reveal = ref(false)
const rotating = ref(false)

async function copy(text: string, what: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: `${what} copied`, icon: 'i-lucide-check', color: 'success' })
}

async function rotate() {
  if (!confirm('Reset your stream key? You will need to paste the new one into OBS.')) return
  rotating.value = true
  try {
    await $fetch('/api/channel/rotate', { method: 'POST' })
    emit('rotated')
    toast.add({ title: 'Stream key reset', color: 'success' })
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Could not reset key', color: 'error' })
  } finally {
    rotating.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <div>
          <h2 class="font-semibold">Stream setup</h2>
          <p class="text-sm text-muted">In OBS: Settings → Stream → Service “Custom…”</p>
        </div>
        <UIcon name="i-lucide-video" class="size-5 text-muted" />
      </div>
    </template>

    <div class="space-y-4">
      <UFormField label="Server">
        <UInput :model-value="props.ingestUrl" readonly class="w-full font-mono" :ui="{ trailing: 'pe-1' }">
          <template #trailing>
            <UButton icon="i-lucide-copy" size="sm" variant="ghost" color="neutral" aria-label="Copy server" @click="copy(props.ingestUrl, 'Server')" />
          </template>
        </UInput>
      </UFormField>

      <UFormField label="Stream key">
        <UInput
          :model-value="props.ingestKey"
          :type="reveal ? 'text' : 'password'"
          readonly
          class="w-full font-mono"
          :ui="{ trailing: 'pe-1' }"
        >
          <template #trailing>
            <UButton :icon="reveal ? 'i-lucide-eye-off' : 'i-lucide-eye'" size="sm" variant="ghost" color="neutral" :aria-label="reveal ? 'Hide key' : 'Show key'" @click="reveal = !reveal" />
            <UButton icon="i-lucide-copy" size="sm" variant="ghost" color="neutral" aria-label="Copy key" @click="copy(props.ingestKey, 'Stream key')" />
          </template>
        </UInput>
      </UFormField>

      <div class="flex items-center justify-between gap-2 text-sm">
        <span class="text-muted">Keep this key private: anyone with it can stream to your channels.</span>
        <UButton
          label="Reset key"
          size="sm"
          variant="soft"
          color="neutral"
          icon="i-lucide-rotate-ccw"
          :loading="rotating"
          :disabled="props.isLive"
          @click="rotate"
        />
      </div>
    </div>
  </UCard>
</template>
