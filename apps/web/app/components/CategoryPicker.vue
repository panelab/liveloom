<script setup lang="ts">
/** Search a platform's categories/games (Twitch, Kick) or pick a YouTube category. */
interface Category { id: string, name: string, image?: string }
const props = defineProps<{ platform: 'twitch' | 'kick' | 'youtube', disabled?: boolean }>()
const model = defineModel<Category | null | undefined>()

const term = ref('')
const items = ref<Category[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

async function search(q: string) {
  loading.value = true
  error.value = null
  try {
    items.value = await $fetch<Category[]>('/api/stream-info/categories', { query: { platform: props.platform, q } })
  } catch (e: any) {
    error.value = e?.data?.message ?? 'Search failed'
    items.value = []
  } finally {
    loading.value = false
  }
}
watch(term, (q) => {
  clearTimeout(timer)
  timer = setTimeout(() => search(q), 250)
})
const options = computed(() => {
  const list = items.value.map((c) => ({ ...c, label: c.name }))
  if (model.value && !list.some((c) => c.id === model.value!.id)) list.unshift({ ...model.value, label: model.value.name })
  return list
})
const selected = computed({
  get: () => (model.value ? { ...model.value, label: model.value.name } : undefined),
  set: (v: any) => { model.value = v ? { id: v.id, name: v.name, ...(v.image ? { image: v.image } : {}) } : null },
})
function onOpen(open: boolean) {
  if (open && props.platform === 'youtube' && !items.value.length) void search('')
}
</script>

<template>
  <UInputMenu
    v-model="selected"
    v-model:search-term="term"
    :items="options"
    :loading="loading"
    ignore-filter
    :disabled="disabled"
    :placeholder="platform === 'youtube' ? 'Choose a category' : 'Search games and categories'"
    :icon="platformIcon[platform]"
    by="id"
    class="w-full"
    :ui="{ leadingIcon: 'text-muted' }"
    @update:open="onOpen"
  >
    <template #item-leading="{ item }">
      <img v-if="(item as any).image" :src="(item as any).image" alt="" class="h-6 w-[17px] rounded-sm object-cover" loading="lazy">
    </template>
    <template #empty>
      <span class="text-xs text-dimmed">{{ error ?? (term ? 'Nothing found' : 'Type to search') }}</span>
    </template>
  </UInputMenu>
</template>
