export default defineEventHandler(async (event) => {
  const { channel } = await requireChannel(event)
  return {
    ingestUrl: useRuntimeConfig(event).public.ingestUrl,
    ingestKey: channel.ingestKey,
    isLive: channel.isLive,
    liveSince: channel.liveSince?.getTime() ?? null,
  }
})
