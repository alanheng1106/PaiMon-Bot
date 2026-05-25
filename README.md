# PaiMon-Bot

PaiMon-Bot is a Discord bot built with `discord.js`, AI chat/image features, and Lavalink-powered music playback.

## Features

- Discord slash commands for admin tools, general utilities, AI, and music
- AI chat command backed by cloud/local model configuration
- Image generation through Hugging Face Inference
- Lavalink music playback with queue, pause, resume, skip, stop, volume, and now playing commands
- Docker Compose setup for running the bot and Lavalink together

## Requirements

- Node.js 20.x
- npm
- Docker and Docker Compose, if running the full container setup
- A Discord application and bot token
- Optional API keys for AI/search/image features

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

3. Fill in `.env` with your Discord token, application IDs, and optional AI keys.

```env
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=

OLLAMA_API_KEY=
OLLAMA_MODEL=llama3.1:8b
HF_TOKEN=
HF_IMAGE_MODEL=stabilityai/stable-diffusion-xl-base-1.0
SERPER_API_KEY=

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
- `/setgame`
- `/setstatus`
- `/shutdown`

AI:

- `/ask`
- `/imagine`

General:

- `/about`
- `/help`
- `/ping`

Music:

- `/join`
- `/play`
- `/pause`
- `/resume`
- `/skip`
- `/stop`
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
- Lavalink uses `youshallnotpass` as the default password in this setup. Change it in both `.env` and `lavalink/application.yml` for production.
