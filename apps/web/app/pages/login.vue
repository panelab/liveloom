<script setup lang="ts">
const { fetch: refreshSession } = useUserSession()
const toast = useToast()

const mode = ref<'login' | 'register'>('login')
const state = reactive({ email: '', password: '' })
const loading = ref(false)

async function submit() {
  loading.value = true
  try {
    await $fetch(`/api/auth/${mode.value}`, { method: 'POST', body: state })
    await refreshSession()
    await navigateTo('/')
  } catch (e: any) {
    toast.add({ title: e?.data?.message ?? 'Something went wrong', color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh grid place-items-center px-4 bg-default">
    <div class="w-full max-w-sm space-y-6">
      <div class="flex flex-col items-center gap-3 text-center">
        <img src="/icon.svg" alt="" class="size-12">
        <div>
          <h1 class="text-xl font-semibold">LiveLoom</h1>
          <p class="text-sm text-muted">Go live everywhere from one stream.</p>
        </div>
      </div>

      <UCard>
        <UTabs
          v-model="mode"
          :items="[{ label: 'Sign in', value: 'login' }, { label: 'Create account', value: 'register' }]"
          :content="false"
          class="mb-4"
        />
        <form class="space-y-4" @submit.prevent="submit">
          <UFormField label="Email">
            <UInput v-model="state.email" type="email" autocomplete="email" required class="w-full" />
          </UFormField>
          <UFormField label="Password" :hint="mode === 'register' ? 'At least 8 characters' : undefined">
            <UInput
              v-model="state.password"
              type="password"
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
              required
              class="w-full"
            />
          </UFormField>
          <UButton type="submit" block :loading="loading" :label="mode === 'login' ? 'Sign in' : 'Create account'" />
        </form>
      </UCard>
    </div>
  </div>
</template>
