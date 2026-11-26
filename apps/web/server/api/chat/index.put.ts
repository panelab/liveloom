import { z } from 'zod'
import { channels, eq } from '@sp/db'

/** Accepts "name", "@name", "#name" or a pasted channel link, and keeps just the name. */
const name = (host: RegExp, re: RegExp, msg: string) =>
  z.string().trim().max(200)
    .transform((v) => v.replace(host, '').replace(/^[@#]/, '').replace(/[/?#].*$/, '') || null)
    .refine((v) => v === null || re.test(v), msg)

const Body = z.object({
  twitch: name(/^(https?:\/\/)?(www\.)?twitch\.tv\//i, /^[A-Za-z0-9_]{3,25}$/, 'Twitch: enter your username, e.g. shroud'),
  kick: name(/^(https?:\/\/)?(www\.)?kick\.com\//i, /^[A-Za-z0-9_-]{2,40}$/, 'Kick: enter your username, e.g. xqc'),
  youtube: z.string().trim().max(200)
    .transform((v) => v || null)
    // A bare handle ("cybnischal") gets its @; IDs and links are kept as they are.
    .transform((v) => (v && /^[\w.-]{3,40}$/.test(v) && !/^UC[\w-]{22}$/.test(v) ? `@${v}` : v))
    .refine((v) => v === null || /^(@[\w.-]{3,40}|UC[\w-]{22}|https?:\/\/\S+|[\w-]{11})$/.test(v), 'YouTube: enter your @handle, channel ID or a video link'),
})

export default defineEventHandler(async (event) => {
  const { channel, db } = await requireChannel(event)
  const b = await parseBody(event, Body)
  await db.update(channels).set({
    twitchLogin: b.twitch?.toLowerCase() ?? null,
    kickSlug: b.kick?.toLowerCase() ?? null,
    youtubeHandle: b.youtube,
  }).where(eq(channels.id, channel.id))
  return { ok: true }
})
