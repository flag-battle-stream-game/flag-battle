# Flag Battle

A physics-based elimination tournament between 211 country/territory flags,
bouncing in a circular arena until one champion remains — built for a
24/7-style live stream (YouTube/Twitch), inspired by "In Bound Tales".

This is a React + Vite + TailwindCSS rewrite of an earlier single-file
HTML/JS prototype, with real SVG flags (via [flag-icons](https://github.com/lipis/flag-icons)),
a YouTube live chat overlay, and `!vote <country>` chat-driven gameplay
influence.

## Project layout

- `/` — the Vite/React app (the actual game view, meant to run in a
  browser or OBS Browser Source).
- `/server` — a small Node/Express backend-for-frontend (BFF) that talks to
  the YouTube Data API v3 so the API key never reaches the browser.

## 1. Install

```bash
# from the project root — installs the Vite app's dependencies AND copies
# flag-icons' SVGs into public/flags/ via the postinstall script
npm install

# in a second terminal — installs the BFF's dependencies
cd server
npm install
```

## 2. Get a YouTube Data API v3 key + a live video/channel id

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), create
   (or pick) a project, and enable **YouTube Data API v3** under
   "APIs & Services → Library".
2. Under "APIs & Services → Credentials", create an **API key**. You can
   optionally restrict it to the YouTube Data API v3.
3. You need either:
   - **`YOUTUBE_LIVE_VIDEO_ID`** — the `v=` part of your live stream's
     watch URL (e.g. `https://www.youtube.com/watch?v=XXXXXXXXXXX` →
     `XXXXXXXXXXX`). Simplest and most reliable — use this once you know
     which broadcast you're running.
   - **`YOUTUBE_CHANNEL_ID`** — your channel's id (found in YouTube Studio
     under "Settings → Channel → Advanced settings", or via the channel's
     "About" page). If set instead of a video id, the server looks up
     whichever video is *currently* live on that channel automatically —
     handy if you don't want to update the id every stream.

## 3. Configure environment variables

**Server** (`server/.env`, copy from `server/.env.example`):

```bash
cd server
cp .env.example .env
# then edit .env and fill in YOUTUBE_API_KEY and either
# YOUTUBE_LIVE_VIDEO_ID or YOUTUBE_CHANNEL_ID
```

**Vite app** (`.env` in the project root, optional — defaults to
`http://localhost:8787`):

```bash
# .env
VITE_SERVER_URL=http://localhost:8787
```

## 4. Run in development

Two terminals:

```bash
# terminal 1 — the game itself
npm run dev
# → opens on http://localhost:5173

# terminal 2 — the BFF (YouTube chat + votes)
cd server
npm start
# → listens on http://localhost:8787
```

The game works perfectly well with the server *not* running — the chat
overlay just stays empty and no vote boosts happen. The physics/tournament
engine never depends on the server being up.

## How chat voting works

Viewers type `!vote <country>` in the YouTube live chat — either an ISO
code (`!vote ro`) or the country's name (`!vote romania`, case-insensitive,
multi-word names supported). The server tallies votes per country for the
current round window (`GET /api/votes`), and the client-side hook
(`src/hooks/useYoutubeChat.js`) periodically boosts whichever country
currently has the most votes via `engine.applyVoteBoost(code, factor,
durationMs)`. **This influence logic is intentionally simple** — see the
comments in `useYoutubeChat.js` and `FlagBattleEngine.applyVoteBoost` for
exactly what it does; tune the factor/duration/decay to taste once you've
watched it play out live. Call `POST /api/votes/reset` (not yet wired to
the UI) to clear the tally, e.g. at the start of a new round.

## Next step: VPS deployment

Once you've run this locally and are happy with how it looks/plays, the
plan is to run it **headless on a VPS for a real 24/7 stream** — most
simply as an OBS Browser Source pointed at the built Vite app (or the dev
server), or fully headless via Chromium + ffmpeg piping the canvas output
into an RTMP stream. That setup (systemd services, ffmpeg pipeline, restart
policy, the BFF running alongside as its own service) is **not built yet**
— it's the deliberate next phase after this app is finished and tested
locally.
