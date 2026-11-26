import { asc, destinations, destinationStatus, eq } from '@sp/db'

export default defineEventHandler(async (event) => {
  const { channel, db } = await requireChannel(event)
  const rows = await db
    .select({ d: destinations, s: destinationStatus })
    .from(destinations)
    .leftJoin(destinationStatus, eq(destinationStatus.destinationId, destinations.id))
    .where(eq(destinations.channelId, channel.id))
    .orderBy(asc(destinations.createdAt))

  return {
    isLive: channel.isLive,
    liveSince: channel.liveSince?.getTime() ?? null,
    destinations: rows.map(({ d, s }) => ({
      id: d.id,
      platform: d.platform,
      name: d.name,
      serverUrl: d.serverUrl,
      streamKeyHint: d.streamKeyHint,
      enabled: d.enabled,
      status: {
        state: s?.state ?? 'idle',
        message: s?.message ?? null,
        bitrateKbps: s?.bitrateKbps ?? null,
        startedAt: s?.startedAt?.getTime() ?? null,
      },
    })),
  }
})
