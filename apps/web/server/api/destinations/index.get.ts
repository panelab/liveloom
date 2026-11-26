import { asc, destinations, destinationStatus, eq } from '@sp/db'
import { healthIssues, type IngestHealth, type PlatformId } from '@sp/shared'

export default defineEventHandler(async (event) => {
  const { channel, db } = await requireChannel(event)
  const rows = await db
    .select({ d: destinations, s: destinationStatus })
    .from(destinations)
    .leftJoin(destinationStatus, eq(destinationStatus.destinationId, destinations.id))
    .where(eq(destinations.channelId, channel.id))
    .orderBy(asc(destinations.createdAt))

  let health: IngestHealth | null = null
  try {
    health = channel.isLive && channel.ingestHealth ? JSON.parse(channel.ingestHealth) : null
  } catch {}
  const live = rows.filter(({ d }) => d.enabled).map(({ d }) => d.platform as PlatformId)

  return {
    isLive: channel.isLive,
    health,
    issues: healthIssues(health, live),
    liveSince: channel.liveSince?.getTime() ?? null,
    destinations: rows.map(({ d, s }) => ({
      id: d.id,
      platform: d.platform,
      name: d.name,
      serverUrl: d.serverUrl,
      streamKeyHint: d.streamKeyHint,
      enabled: d.enabled,
      connected: !!d.connectionId,
      status: {
        state: s?.state ?? 'idle',
        message: s?.message ?? null,
        bitrateKbps: s?.bitrateKbps ?? null,
        startedAt: s?.startedAt?.getTime() ?? null,
      },
    })),
  }
})
