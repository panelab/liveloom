# Setting up "Connect with YouTube / Twitch / Kick"

The **Connect** buttons on the Destinations page sign in to each platform and fetch your stream key, server URL and chat channel automatically. Each platform requires you to register a free developer app first. Allow about 10 minutes per platform.

Use these callback (redirect) URLs. Replace the domain if yours is different:

| Platform | Callback URL |
|---|---|
| YouTube | `https://stream.discerns.app/api/connect/youtube/callback` |
| Twitch | `https://stream.discerns.app/api/connect/twitch/callback` |
| Kick | `https://stream.discerns.app/api/connect/kick/callback` |

Each app gives you a **Client ID** and a **Client secret**. They go into `.env` on the server:

```sh
NUXT_CONNECT_YOUTUBE_CLIENT_ID=...
NUXT_CONNECT_YOUTUBE_CLIENT_SECRET=...
NUXT_CONNECT_TWITCH_CLIENT_ID=...
NUXT_CONNECT_TWITCH_CLIENT_SECRET=...
NUXT_CONNECT_KICK_CLIENT_ID=...
NUXT_CONNECT_KICK_CLIENT_SECRET=...
```

Then restart the dashboard with `docker compose up -d web`. A platform's button turns on as soon as its credentials are set, so you can set up one platform at a time.

---

## Twitch

1. Turn on **two-factor authentication** for your Twitch account (Settings → Security and Privacy). Twitch requires it before you can register apps.
2. Open the [Twitch Developer Console](https://dev.twitch.tv/console/apps) and click **Register Your Application**.
3. Fill in:
   - **Name:** something unique, for example `LiveLoom-yourname`. Names are global across Twitch.
   - **OAuth Redirect URLs:** `https://stream.discerns.app/api/connect/twitch/callback`
   - **Category:** Broadcasting Suite
   - **Client Type:** Confidential
4. Click **Create**, then **Manage** on the new app.
5. Copy the **Client ID**. Click **New Secret** and copy the **Client Secret**. Twitch shows it only once.

LiveLoom asks for one permission: `channel:read:stream_key`.

## Kick

1. Turn on **two-factor authentication** for your Kick account. Kick requires it for developer apps.
2. Go to **kick.com → Settings → Developer** and create a new app.
3. Fill in:
   - **App name:** `LiveLoom`
   - **Redirect URL:** `https://stream.discerns.app/api/connect/kick/callback`
   - **Scopes:** tick **Read user information** (`user:read`), **Read channel information** (`channel:read`) and **Read stream URL and stream key** (`streamkey:read`)
4. Save, then copy the **Client ID** and **Client Secret**.

## YouTube (Google Cloud)

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a project, for example `LiveLoom`.
2. Go to **APIs & Services → Library**, search for **YouTube Data API v3**, and click **Enable**.
3. Go to **Google Auth Platform** (formerly "OAuth consent screen") and click **Get started**:
   - **App name:** `LiveLoom`. **User support email:** your email.
   - **Audience:** External.
   - **Contact email:** your email. Agree to the policy, then click **Create**.
4. Under **Audience**, leave the app in **Testing** and add your own Google account (the one that owns the YouTube channel) under **Test users**.
5. Under **Data Access**, click **Add or remove scopes** and add `https://www.googleapis.com/auth/youtube.readonly`. Save.
6. Under **Clients**, click **Create client**:
   - **Application type:** Web application
   - **Authorized redirect URIs:** `https://stream.discerns.app/api/connect/youtube/callback`
7. Click **Create** and copy the **Client ID** and **Client secret**.

Notes for YouTube:
- In **Testing** mode, only the test users you added can connect. That's fine for your own channel. Making the app available to everyone requires Google's verification review for the YouTube scope.
- Google shows a "Google hasn't verified this app" screen while the app is in testing. Click **Continue**.
- In testing mode, Google expires the sign-in after 7 days. Your saved stream key keeps working, and you only need to click **Reconnect** if you want LiveLoom to fetch a new key.
- If you've never streamed on YouTube, open **YouTube Studio → Go live** once first. YouTube only creates a stream key after live streaming is enabled, which can take up to 24 hours the first time.

---

## What LiveLoom stores

- Your platform sign-in tokens, **encrypted** with `ENCRYPTION_KEY`, only so it can refresh your stream key later.
- The stream key and server URL, encrypted like keys you add manually.
- Your channel name, used for merged chat.

**Disconnect** on the Destinations page deletes the tokens and keeps the destination. You can also revoke access from each platform's connected-apps settings.
