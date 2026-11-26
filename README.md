<img src="assets/icon.svg" width="64" height="64" alt="">

# LiveLoom

Stream once from OBS and go live on YouTube, Twitch, Kick, Facebook, TikTok, X and any other RTMP platform at the same time.

```
OBS ─────(RTMP)──┐
Browser ─(WHIP)──┴─► MediaMTX ──► relay (FFmpeg -c copy) ──┬──► YouTube
                                 one process per platform   ├──► Twitch
                                                           ├──► Kick
                                                           └──► …
Dashboard (Nuxt) ──► Turso/libSQL ◄── relay reads destinations, writes live status
```

The relay copies the stream without re-encoding, so CPU use stays close to zero. Your upload bandwidth is only spent once.

**Highlights**
- **Connect with YouTube, Twitch and Kick:** sign in once and LiveLoom fetches your stream keys, server URLs and chat channels. See [docs/connect-apps.md](docs/connect-apps.md).
- **One-click OBS setup:** the Multichat plugin signs in with a short code and fills in OBS's stream server, key, keyframe interval and bitrate.
- **Stream health checks:** a few seconds after you go live, LiveLoom measures what OBS sends (resolution, frame rate, keyframes, bitrate, codecs) and tells you the exact OBS setting to change for each platform you're streaming to, both in the dashboard and in the OBS dock.
- **Go live from the browser (Studio):** share your screen, camera, or screen with a camera bubble, plus your mic, over WebRTC (WHIP). No OBS needed. LiveLoom converts it to H.264/AAC with 2 s keyframes once, then sends it to every platform.
- **Merged chat** from Twitch, Kick and YouTube in the dashboard and in OBS.
- Open source and self-hosted: no watermark, no destination limit, and your keys stay on your server.

## Multichat for OBS

A native OBS plugin that merges **Twitch, Kick and YouTube chat** into one feed, with each message tagged by its platform's icon.

<p align="center">
  <img src="docs/images/obs-multichat.png" width="380" alt="The Multichat dock in OBS showing YouTube and Kick messages merged into one feed, with the Multichat source in the Sources list">
</p>

- **Multichat dock**: read chat from every platform on your monitor, inside OBS.
- **Multichat source**: show chat on stream. Font, colors, background, platform icons, platform filters and fade-out are all configurable.
- Usernames keep their platform colors, and emotes appear as images.
- **Stream health** warnings in the dock while you're live, each with the exact fix.
- Needs no platform logins or API keys: LiveLoom reads chat on the server and streams it to the plugin.

### Install

Download the file for your OS from the [latest release](https://github.com/panelab/liveloom/releases):

| OS | File | Install |
|---|---|---|
| Windows | `obs-multichat-*-windows-x64.zip` | Extract into `C:\ProgramData\obs-studio\plugins\` |
| macOS | `obs-multichat-*-macos-universal.pkg` | Run the installer. The first time, right-click it and choose **Open**. |
| Linux (Ubuntu/Debian) | `obs-multichat-*-x86_64-linux-gnu.deb` | `sudo apt install ./obs-multichat-*.deb` |

Requires OBS 30 or newer. Then:

1. Restart OBS. The **Multichat** dock opens.
2. Click **Sign in to LiveLoom**. Your browser opens with a code. Check that it matches the one in OBS, then click **Approve**.
3. OBS's stream settings are filled in for you: LiveLoom server and key, 2 s keyframes, and bitrate capped at 6000 Kbps.
4. To show chat on stream, add **Sources → + → Multichat** to a scene.

Chat sources come from your connected accounts, or you can enter them on the dashboard's **Chat** page. The dock also shows stream health warnings while you're live.

Source code and build instructions: [`plugins/obs-multichat`](plugins/obs-multichat).

## Monorepo

Bun workspaces + Turborepo.

| Path | What | Runs on |
|---|---|---|
| `apps/web` | Nuxt 4 + Nuxt UI dashboard and API (auth, destinations, status) | **VPS (Bun) or Cloudflare Workers** |
| `apps/relay` | Bun service: MediaMTX auth hook, supervises FFmpeg pushes with reconnect backoff, merged chat over SSE | **VPS only** (needs FFmpeg + long-lived processes) |
| `packages/db` | Drizzle ORM schema + libSQL client, migrations | shared |
| `packages/shared` | Platform presets, AES-GCM key encryption (Web Crypto) | shared |
| `plugins/obs-multichat` | Multichat OBS plugin (C++/Qt): chat dock and on-stream source | Windows, macOS, Linux (built by GitHub Actions) |
| `infra/` | MediaMTX config, Caddy, dev compose | |

The web app only reads from and writes to the database. It never talks to the relay directly, which is why it can run anywhere.

## Develop

Prerequisites: [Bun](https://bun.sh), [Turso CLI](https://docs.turso.tech/cli/installation), FFmpeg, Docker.

```sh
bun install
cp .env.example .env            # then fill ENCRYPTION_KEY, RELAY_SECRET, NUXT_APP_SECRET (commands are in the file)

bun dev:db                      # terminal 1: local libSQL server → ./data/dev.db
bun dev:media                   # terminal 2: MediaMTX (RTMP :1935, SRT :8890)
bun dev                         # terminal 3: relay + web (http://localhost:3000)
```

The relay applies database migrations when it starts. After changing `packages/db/src/schema.ts`, run `bun db:generate`.

Then sign up at http://localhost:3000, add destinations, and point OBS at the **Server** and **Stream key** shown in the dashboard.

Test without OBS:

```sh
ffmpeg -re -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine \
  -c:v libx264 -preset veryfast -b:v 2500k -g 60 -c:a aac -f flv rtmp://localhost:1935/live/<your-key>
```

### Browse the database

```sh
bun db:studio          # opens ./data/dev.db in Stroke (desktop app or stroke.click/studio)
bun db:studio:share    # same, but prints a read-only link you can open from another machine
```

`db:studio` uses a bridge on `127.0.0.1`, so it only works when your browser runs on the same machine. On a remote VPS, use `db:studio:share` or an SSH tunnel. Stroke opens SQLite files, so this is for the local dev database. For Turso cloud, use `turso db shell` or the Turso dashboard.

## Deploy

### Everything on a VPS (Docker)

```sh
cp .env.example .env    # fill secrets; DOMAIN=stream.example.com, NUXT_PUBLIC_INGEST_URL=rtmp://<DOMAIN>:1935/live
docker compose up -d --build
```

This runs libSQL (sqld), MediaMTX, the relay, the web app, and **Caddy**, which serves `https://$DOMAIN` with an automatic Let's Encrypt certificate. The web app listens only on `127.0.0.1:3000`, so it's reachable only through Caddy.

Checklist:
1. **DNS**: create an `A` record for `$DOMAIN` pointing to the server's public IP. On Cloudflare, set it to **DNS only (grey cloud)**, because Cloudflare's proxy doesn't pass RTMP on port 1935.
2. **Cloud firewall** (for example an Oracle Cloud Security List): allow ingress on 80/tcp, 443/tcp, 443/udp, 1935/tcp, 8890/udp and 8189/udp+tcp.
3. **Host firewall**: Oracle's Ubuntu images reject everything except SSH. Add `ACCEPT` rules for the same ports before the `REJECT` line in `/etc/iptables/rules.v4`.
4. On Oracle, use a **Reserved** public IP so the address survives an instance stop or start.

To use Turso cloud instead of the bundled libSQL server, set `DATABASE_URL_DOCKER=libsql://…` and `DATABASE_AUTH_TOKEN` in `.env`, then run `docker compose up -d --build mediamtx relay web`.

### Dashboard on Cloudflare, relay on a VPS

1. Create a Turso database: `turso db create streaming`, then `turso db show --url streaming` and `turso db tokens create streaming`.
2. VPS: set `DATABASE_URL_DOCKER` and `DATABASE_AUTH_TOKEN` to the Turso values, then `docker compose up -d --build mediamtx relay`.
3. Cloudflare (from `apps/web`):
   ```sh
   bunx wrangler secret put DATABASE_URL
   bunx wrangler secret put DATABASE_AUTH_TOKEN
   bunx wrangler secret put ENCRYPTION_KEY       # must be the SAME value as on the relay
   bunx wrangler secret put NUXT_APP_SECRET
   # set NUXT_PUBLIC_INGEST_URL in wrangler.jsonc to rtmp://<vps-host>:1935/live
   bun run deploy:cf
   ```

## Security notes

- Platform stream keys are encrypted with AES-256-GCM (`ENCRYPTION_KEY`), shown masked in the UI, and removed from relay logs.
- MediaMTX checks every publish with the relay. Only existing ingest keys can stream, and only the relay can read streams or use the MediaMTX API.
- Keep the relay's port 8787 and the MediaMTX API on port 9997 private. The Docker setup doesn't publish them.

## Roadmap ideas

- Reply to chat from the OBS dock
- Facebook, TikTok and X chat
- YouTube/Twitch OAuth to set titles and create broadcasts automatically
- Vertical 9:16 output for TikTok/Shorts (needs transcoding)
- Multiple channels per user, teams
