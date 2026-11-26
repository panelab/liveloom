<script setup lang="ts">
/** Title, description, tags and categories: written once, sent to every connected platform. */
interface Category { id: string, name: string, image?: string }
type P = 'twitch' | 'kick' | 'youtube'
const props = defineProps<{ compact?: boolean }>()
const toast = useToast()
const dash = useDashboard()
interface Info { title: string, description: string, tags: string[], categories: Partial<Record<P, Category | null>>, applied: Partial<Record<P, { ok: boolean, message: string, at: number }>> }
interface Res { info: Info, limits: { title: number, description: number, tags: number }, platforms: { platform: P, name: string, connected: boolean, canEdit: boolean, available: boolean, username: string | null }[] }
const { data, refresh } = useFetch<Res>('/api/stream-info', { key: 'stream-info' })

const form = reactive({ title: '', description: '', tags: [] as string[], categories: {} as Partial<Record<P, Category | null>> })
const snapshot = ref('')
watch(() => data.value?.info, (i) => {
  if (!i) return
  Object.assign(form, { title: i.title, description: i.description, tags: [...i.tags], categories: { ...i.categories } })
  snapshot.value = JSON.stringify(form)
}, { immediate: true })
const dirty = computed(() => JSON.stringify(form) !== snapshot.value)

const platforms = computed(() => data.value?.platforms ?? [])
const editable = computed(() => platforms.value.filter((p) => p.connected && p.canEdit))
const needsReconnect = computed(() => platforms.value.filter((p) => p.connected && !p.canEdit))
const applied = computed(() => data.value?.info.applied ?? {})
const limits = computed(() => data.value?.limits ?? { title: 140, description: 5000, tags: 10 })

const saving = ref<false | 'save' | 'apply'>(false)
async function save(apply: boolean) {
  saving.value = apply ? 'apply' : 'save'
  try {
    const res = await $fetch<{ info: Info }>('/api/stream-info', { method: 'PUT', body: { ...form, apply } })
    await refresh()
    if (!apply) {
      toast.add({ title: 'Saved', description: editable.value.length ? 'Sent to your platforms when you go live.' : undefined, icon: 'i-lucide-check', color: 'success', duration: 2000 })
    } else {
      const results = Object.entries(res.info.applied ?? {}) as [P, { ok: boolean, message: string }][]
      const failed = results.filter(([, r]) => !r.ok)
      toast.add(failed.length
        ? { title: `Couldn’t update ${failed.map(([p]) => PLATFORM_NAMES[p]).join(', ')}`, description: failed[0]![1].message, color: 'error' }
        : { title: `Updated on ${results.map(([p]) => PLATFORM_NAMES[p]).join(', ')}`, icon: 'i-lucide-check', color: 'success', duration: 2500 })
    }
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Could not save', color: 'error' })
  } finally {
    saving.value = false
  }
}
defineShortcuts({ meta_enter: { usingInput: true, handler: () => { if (dirty.value) void save(editable.value.length > 0) } } })

const ago = (t: number) => {
  const s = Math.max(0, Math.round((dash.now.value - t) / 1000))
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`
}
</script>

<template>
  <UiPanel id="stream-details" title="Stream details" :description="compact ? undefined : 'Write your title once. LiveLoom sets it on every connected platform, now or when you go live.'">
    <form class="space-y-4" @submit.prevent="save(editable.length > 0)">
      <UFormField label="Title" :hint="`${form.title.length}/${limits.title}`">
        <UInput v-model="form.title" :maxlength="limits.title" placeholder="What are you streaming today?" class="w-full" size="lg" />
      </UFormField>

      <template v-if="!compact">
        <UFormField label="Description" hint="YouTube">
          <UTextarea v-model="form.description" :maxlength="limits.description" :rows="3" autoresize :maxrows="10" placeholder="Links, schedule, socials…" class="w-full" />
        </UFormField>
        <UFormField label="Tags" :hint="`${form.tags.length}/${limits.tags}`" help="Press Enter after each tag. Twitch keeps only letters and numbers.">
          <UInputTags v-model="form.tags" :max="limits.tags" :max-length="25" placeholder="Add a tag" class="w-full" />
        </UFormField>
      </template>

      <div v-if="editable.length" class="grid gap-3" :class="!compact && 'sm:grid-cols-3'">
        <UFormField v-for="p in editable" :key="p.platform" :label="p.platform === 'youtube' ? 'YouTube category' : `${p.name} category`">
          <CategoryPicker v-model="form.categories[p.platform as P]" :platform="p.platform as P" />
        </UFormField>
      </div>

      <UiCallout
        v-if="!editable.length && !needsReconnect.length"
        tone="info"
        icon="i-lucide-link-2"
        title="Connect your accounts to update titles automatically"
        description="Details are saved here. Connect YouTube, Twitch or Kick in Settings and LiveLoom will set them for you."
      >
        <UButton label="Open Settings" to="/settings" variant="link" color="neutral" size="xs" class="mt-1 px-0" trailing-icon="i-lucide-arrow-right" />
      </UiCallout>
      <UiCallout
        v-for="p in needsReconnect"
        :key="p.platform"
        tone="warning"
        :title="`Reconnect ${p.name} to update its title`"
        :description="`${p.name} was connected before LiveLoom could change titles. Reconnect once to allow it.`"
      >
        <UButton :label="`Reconnect ${p.name}`" :to="`/api/connect/${p.platform}`" external variant="link" color="neutral" size="xs" class="mt-1 px-0" trailing-icon="i-lucide-arrow-right" />
      </UiCallout>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ul v-if="Object.keys(applied).length" class="flex flex-wrap gap-x-4 gap-y-1">
          <li v-for="(r, p) in applied" :key="p" class="flex items-center gap-1.5 text-xs" :title="r!.message">
            <UiPlatformIcon :platform="p" size="sm" />
            <span :class="r!.ok ? 'text-muted' : 'text-error'">{{ r!.ok ? `Updated ${ago(r!.at)}` : 'Failed' }}</span>
          </li>
        </ul>
        <div class="ml-auto flex gap-2">
          <UButton v-if="editable.length" label="Save" variant="ghost" color="neutral" :loading="saving === 'save'" :disabled="!dirty || !!saving" @click="save(false)" />
          <UTooltip :text="editable.length ? 'Save and update now' : 'Save'" :kbds="['meta', 'enter']">
            <UButton type="submit" :label="editable.length ? 'Update on platforms' : 'Save'" :loading="saving === 'apply' || (!editable.length && saving === 'save')" :disabled="!!saving || (!dirty && !editable.length)" />
          </UTooltip>
        </div>
      </div>
    </form>
  </UiPanel>
</template>
