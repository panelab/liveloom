export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (!loggedIn.value && to.path !== '/login') {
    return navigateTo({ path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} })
  }
  if (loggedIn.value && to.path === '/login') return navigateTo('/')
})
