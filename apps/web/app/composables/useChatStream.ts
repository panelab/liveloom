import type { ChatEvent, ChatMessage, ChatSourceStatus } from '@sp/shared'

/** Live merged chat from the relay (same stream the OBS plugin reads). */
export function useChatStream(token: Ref<string | undefined>, opts: { detached?: boolean } = {}) {
  const config = useRuntimeConfig()
  const messages = ref<ChatMessage[]>([])
  const sources = ref<ChatSourceStatus[]>([])
  const connected = ref(false)
  let es: EventSource | null = null

  function connect() {
    es?.close()
    connected.value = false
    if (!token.value) return
    const base = (config.public.chatServerUrl as string) || location.origin
    es = new EventSource(`${base}/chat/events?token=${encodeURIComponent(token.value)}`)
    es.onopen = () => { connected.value = true }
    es.onerror = () => { connected.value = false }
    const on = (e: MessageEvent) => {
      const ev = JSON.parse(e.data) as ChatEvent
      connected.value = true
      if (ev.type === 'hello') { messages.value = ev.history.slice(-200); sources.value = ev.sources }
      else if (ev.type === 'status') sources.value = ev.sources
      else if (ev.type === 'message') {
        messages.value.push(ev.message)
        if (messages.value.length > 300) messages.value.splice(0, messages.value.length - 300)
      }
    }
    for (const t of ['hello', 'status', 'message']) es.addEventListener(t, on as EventListener)
  }

  watch(token, connect)
  // Works inside a component, or detached (the Studio session lives outside pages).
  if (opts.detached) {
    if (import.meta.client) connect()
  } else {
    onMounted(connect)
    onBeforeUnmount(() => es?.close())
  }
  return { messages, sources, connected, reconnect: connect }
}
