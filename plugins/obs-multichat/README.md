# Multichat for OBS

Native OBS plugin (C++/Qt) that shows **Twitch, Kick and YouTube chat merged into one feed**, each message tagged with its platform icon.

- **Multichat dock**: chat on your monitor, inside OBS. Opens the first time; afterwards use **Docks → Multichat**.
- **Multichat source**: chat on stream. Add it with **Sources → + → Multichat**. Font, colors, background, icons, platform filters, and "hide messages after N seconds" are in its properties.

Chat is collected by the streaming platform server (`apps/relay`) and streamed to the plugin over one HTTPS connection, so the plugin needs no platform logins or API keys.

## Set up

1. In the dashboard (https://stream.discerns.app), under **Merged chat**, enter your Twitch username, Kick username and YouTube @handle, then save.
2. Copy the **Plugin token** from the same card.
3. In OBS, click ⚙ in the Multichat dock, paste the token (the server is prefilled), and save.

## Install

Download the build for your OS from the GitHub Actions run or Release:

| OS | File | Install |
|---|---|---|
| Windows | `obs-multichat-*-windows-x64.zip` | Extract into `C:\ProgramData\obs-studio\plugins\` |
| macOS | `obs-multichat-*-macos-universal.pkg` | Run the installer |
| Ubuntu | `obs-multichat-*-x86_64-linux-gnu.deb` | `sudo apt install ./obs-multichat-*.deb` |

Requires OBS 30 or newer.

## Build locally (Linux)

```sh
sudo apt install obs-studio libobs-dev qt6-base-dev libcurl4-openssl-dev cmake ninja-build
cmake -S . -B build_local -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build build_local
# install for the current user
mkdir -p ~/.config/obs-studio/plugins/obs-multichat/{bin/64bit,data}
cp build_local/obs-multichat.so ~/.config/obs-studio/plugins/obs-multichat/bin/64bit/
cp -r data/* ~/.config/obs-studio/plugins/obs-multichat/data/
```

Windows and macOS builds use the obs-plugintemplate scripts in `.github/scripts` (see `.github/workflows/obs-plugin.yaml` at the repo root).

## How it works

```
Twitch IRC ─┐
Kick Pusher ─┼─► relay (ChatHub) ── GET /chat/events (SSE, Bearer token) ──► plugin
YouTube     ─┘                                                              ├─ dock (QTextBrowser)
                                                                            └─ source (QPainter → texture)
```

- `src/chat-client.*`: libcurl SSE client on a worker thread, reconnects with backoff
- `src/image-cache.*`: downloads emote images in the background
- `src/chat-render.*`: shared message layout, used for the dock and the on-stream bubbles
- `src/chat-dock.*`, `src/chat-source.*`: the OBS dock and source

License: GPL-2.0-or-later (required for OBS plugins).
