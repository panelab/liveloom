import { z } from 'zod'
import { channels, eq } from '@sp/db'

const name = (re: RegExp, msg: string) =>
  z.string().trim().max(120).transform((v) => v || null).refine((v) => v === null || re.test(v), msg)

const Body = z.object({
  twitch: name(/^#?[A-Za-z0-9_]{3,25}$/, 'Twitch: enter your username, e.g. shroud'),
  kick: name(/^@?[A-Za-z0-9_-]{2,40}$/, 'Kick: enter your username, e.g. xqc'),
  youtube: name(/^(@[\w.-]{3,40}|UC[\w-]{22}|https?:\/\/\S+|[\w-]{11})$/, 'YouTube: enter your @handle, channel ID or a video link'),
})

export default defineEventHandler(async (event) => {
  const { channel, db } = await requireChannel(event)
  const b = await readValidatedBody(event, Body.parse)
  await db.update(channels).set({
    twitchLogin: b.twitch?.replace(/^#/, '').toLowerCase() ?? null,
    kickSlug: b.kick?.replace(/^@/, '').toLowerCase() ?? null,
    youtubeHandle: b.youtube,
  }).where(eq(channels.id, channel.id))
  return { ok: true }
})
