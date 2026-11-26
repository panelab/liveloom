<script setup lang="ts">
definePageMeta({ layout: false })

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
  <div class="relative grid min-h-dvh place-items-center bg-default px-4">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--ui-bg-accented),transparent_60%)] opacity-60" />
    <div class="relative w-full max-w-sm">
      <div class="mb-8 flex flex-col items-center gap-3 text-center">
        <img src="/icon.svg" alt="" class="size-10 rounded-lg">
        <div>
          <h1 class="text-lg font-semibold tracking-tight text-highlighted">
            {{ mode === 'login' ? 'Sign in to LiveLoom' : 'Create your LiveLoom account' }}
          </h1>
          <p class="mt-1 text-sm text-muted">Stream once. Go live everywhere.</p>
        </div>
      </div>

      <form class="space-y-3 rounded-lg border border-default bg-elevated/60 p-5" @submit.prevent="submit">
        <UFormField label="Email">
          <UInput v-model="state.email" type="email" autocomplete="email" required autofocus class="w-full" size="md" />
        </UFormField>
        <UFormField label="Password" :hint="mode === 'register' ? 'At least 8 characters' : undefined">
          <UInput
            v-model="state.password"
            type="password"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            required
            class="w-full"
            size="md"
          />
        </UFormField>
        <UButton type="submit" block size="md" :loading="loading" :label="mode === 'login' ? 'Sign in' : 'Create account'" class="mt-2" />
      </form>

      <p class="mt-4 text-center text-sm text-muted">
        {{ mode === 'login' ? 'New here?' : 'Already have an account?' }}
        <button class="font-medium text-highlighted hover:underline" @click="mode = mode === 'login' ? 'register' : 'login'">
          {{ mode === 'login' ? 'Create an account' : 'Sign in' }}
        </button>
      </p>
    </div>
  </div>
</template>
