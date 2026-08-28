# Spotify ↔ YT Music Playlist Sync

Self-hosted playlist sync between Spotify and YouTube Music, with a web UI to
configure sync rules and schedules. Runs as a single Docker container.

## Features

- Sync any number of playlist pairs, each with its own direction (Spotify → YT
  Music or YT Music → Spotify) and mode:
  - **Additive**: only adds missing tracks, never removes anything.
  - **Mirror**: destination is made to match the source exactly (adds + removes).
- Track matching by ISRC first, normalized title/artist fuzzy match as fallback.
- Per-rule schedule: simple interval (every N minutes) or a cron expression.
- OAuth login for both services from the web UI — no manually copying API
  tokens around after initial setup.
- Optional webhook notifications (works with ntfy, Discord, Slack, or any
  JSON-accepting webhook URL) on failure or every run.
- Run history/log in the UI.

## Setup

### 1. Register API credentials (one-time, done by whoever hosts this)

**Spotify**
1. Create an app at https://developer.spotify.com/dashboard
2. Add a Redirect URI matching `SPOTIFY_REDIRECT_URI` (e.g.
   `http://<your-server>:8000/api/auth/spotify/callback`)
3. Copy the Client ID and Client Secret.

**YouTube Music (Google)**
1. Create a project at https://console.cloud.google.com/
2. Enable the "YouTube Data API v3"
3. Create OAuth credentials of type **TVs and Limited Input devices**
4. Copy the Client ID and Client Secret.

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the values, including a generated
`ENCRYPTION_KEY`:

```bash
cp .env.example .env
python3 -c "import secrets,base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

### 3. Run

```bash
docker compose up -d --build
```

Open `http://<your-server>:8000`, go to **Settings**, and connect both
accounts. Google/YT Music uses a device-code flow (visit a URL, enter a
code) so it works even though the app itself isn't reachable from Google.

### 4. Create sync rules

Go to **Sync Rules → New Rule**, pick source/destination service and
playlist ID, mode, and schedule. The destination playlist must already
exist — create it in Spotify or YT Music first, then paste its playlist ID.

## Notes

- This is a single-user instance: one Spotify account and one Google/YT
  Music account per deployment. Run a second container if you need to sync
  a second person's accounts.
- All tokens are encrypted at rest in the SQLite database (`/data/app.db`),
  using `ENCRYPTION_KEY` from your environment. Back up the `/data` volume
  to preserve your rules, history, and connections.
- YT Music has no official public API; this uses `ytmusicapi`, an
  unofficial client. It can break if Google changes internal endpoints.
