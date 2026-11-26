// Deploy targets (set at build time):
//   VPS:        NITRO_PRESET=bun               (default)  → bun .output/server/index.mjs
//   Cloudflare: NITRO_PRESET=cloudflare_module           → wrangler deploy
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  modules: ['@nuxt/ui', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  colorMode: { preference: 'dark', fallback: 'dark' },
  fonts: { families: [{ name: 'Inter', provider: 'google' }, { name: 'JetBrains Mono', provider: 'google' }] },
  app: {
    head: {
      title: 'LiveLoom',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' }],
    },
  },
  runtimeConfig: {
    // Server-only. Override at runtime with NUXT_DATABASE_URL etc., or the
    // plain DATABASE_URL / DATABASE_AUTH_TOKEN / ENCRYPTION_KEY (see server/utils/env.ts).
    databaseUrl: '',
    databaseAuthToken: '',
    encryptionKey: '',
    // "Connect with …" app credentials: NUXT_CONNECT_TWITCH_CLIENT_ID, NUXT_CONNECT_TWITCH_CLIENT_SECRET, etc.
    connect: {
      youtube: { clientId: '', clientSecret: '' },
      twitch: { clientId: '', clientSecret: '' },
      kick: { clientId: '', clientSecret: '' },
    },
    public: {
      // Public URL of this dashboard, used for OAuth callbacks and the plugin sign-in page
      siteUrl: '', // NUXT_PUBLIC_SITE_URL
      ingestUrl: 'rtmp://localhost:1935/live', // NUXT_PUBLIC_INGEST_URL
      // Where /chat/events is served (the relay). Empty = same origin (Caddy routes /chat/* to the relay).
      chatServerUrl: '', // NUXT_PUBLIC_CHAT_SERVER_URL
    },
  },
  nitro: {
    // Dev: forward chat to the relay like Caddy does in production
    devProxy: { '/chat/events': { target: 'http://127.0.0.1:8787/chat/events', changeOrigin: true } },
    preset: process.env.NITRO_PRESET || 'bun',
    cloudflare: { nodeCompat: true, deployConfig: true },
  },
})
