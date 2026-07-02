# PaiMon-Bot

PaiMon-Bot is a Discord bot built with `discord.js` and Lavalink-powered music playback.

## Features

- Discord slash commands for admin tools, general utilities, and music
- Lavalink music playback with queue, loop, shuffle, pause, resume, skip, stop, volume, and now playing commands
- Text-to-speech (TTS) powered by Google TTS, with intelligent queue interruption
- Per-user command cooldown system to prevent spam
- Guild settings persistence (volume survives restarts)
- Docker Compose setup for running the bot and Lavalink together

## Requirements

- Node.js 20.x
- npm
- Docker and Docker Compose, if running the full container setup
- A Discord application and bot token

## Setup

1. Clone the repository.

```bash
git clone git@github.com:alanheng1106/PaiMon-Bot.git
cd PaiMon-Bot
```

2. Create your environment file.

```bash
cp .env.example .env
```

3. Fill in `.env` with your Discord token, application IDs, and optional keys.

```env
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
OWNER_ID=

LAVALINK_HOST=lavalink
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_SECURE=false
```

## Run With Docker Compose

From the repository root:

```bash
docker compose up --build
```

This starts:

- `discord-bot`, built from `bot-source/`
- `lavalink`, using the Lavalink v4 image and `lavalink/application.yml`

## Run Locally

If Lavalink is already running separately:

```bash
cd bot-source
npm install
npm start
```

For local bot execution, set `LAVALINK_HOST`, `LAVALINK_PORT`, and `LAVALINK_PASSWORD` in `.env` to match your Lavalink server.

## Commands

Admin:

- `/ban`
- `/kick`
- `/rename`

Owner:

- `/setgame`
- `/setstatus`
- `/shutdown`
- `/restart`

General:

- `/about`
- `/help`
- `/ping`
- `/tts`

Music:

- `/join`
- `/play`
- `/pause`
- `/resume`
- `/skip`
- `/stop`
- `/loop`
- `/shuffle`
- `/queue`
- `/nowplaying`
- `/volume`
- `/disconnect`

## Project Structure

```text
.
├── bot-source/
│   ├── index.js
│   ├── package.json
│   └── src/
│       ├── commands/
│       ├── core/
│       ├── data/          ← guild-settings.json (auto-created)
│       └── events/
├── lavalink/
│   └── application.yml
├── docker-compose.yml
├── .env.example
└── README.md
```

## Notes

- Keep `.env` private. It is ignored by Git.
- `node_modules/`, Lavalink logs, and downloaded jar files are ignored by Git.
- Set `OWNER_ID` in `.env` to your Discord user ID. Owner commands (`/setgame`, `/setstatus`, `/shutdown`, `/restart`) are restricted to this user regardless of server permissions.
- Lavalink uses `youshallnotpass` as the default password in this setup. **Change it** in both `.env` and `lavalink/application.yml` before deploying.
- Lavalink is not exposed on the host network by default; it communicates with the bot through the internal Docker network only.
- Guild settings (e.g. volume) are persisted in `bot-source/data/guild-settings.json` and survive bot restarts.
