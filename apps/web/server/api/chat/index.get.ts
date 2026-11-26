import { and, channels, deviceCodes, eq } from '@sp/db'
import { randomToken } from '@sp/shared'

export default defineEventHandler(async (event) => {
  const { user, channel, db } = await requireChannel(event)
  let token = channel.chatToken
  if (!token) {
    token = randomToken(24)
    await db.update(channels).set({ chatToken: token }).where(eq(channels.id, channel.id))
  }
  const [signedIn] = await db.select({ c: deviceCodes.userCode }).from(deviceCodes)
    .where(and(eq(deviceCodes.userId, user.id), eq(deviceCodes.status, 'consumed'))).limit(1)
  return {
    token,
    pluginSeen: !!signedIn,
    twitch: channel.twitchLogin ?? '',
    kick: channel.kickSlug ?? '',
    youtube: channel.youtubeHandle ?? '',
  }
})
