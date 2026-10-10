# PaiMon Bot

Next-Gen Discord Bot built with Bun, TypeScript, and Discord.js, featuring an advanced AI gateway, SDXL image generation, Lavalink music support, and rich utility commands.

## Features

- **AI Architecture**: Multi-provider support (OpenAI-compatible endpoints, VTC GenAI), tool use / function calling, multi-turn chat sessions, reasoning/thinking modes, and user memory persistence.
- **Music System**: Powered by Shoukaku & Lavalink with dynamic control UI and queue management.
- **Tools & Utilities**: Web search (Serper), code execution sandbox, calculator, and system diagnostics.
- **Image Generation**: Multi-backend image synthesis supporting custom image endpoints and Hugging Face SDXL.

## Prerequisites

- [Bun](https://bun.sh/) (>= 1.1.0)
- [Lavalink](https://github.com/lavalink-devs/Lavalink) (for music playback)

## Setup

1. Clone repository:
   ```bash
   git clone https://github.com/alanheng1106/PaiMon-Bot.git
   cd PaiMon-Bot
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Configure environment:
   Copy `.env.example` to `.env` and fill in your credentials.
   ```bash
   cp .env.example .env
   ```

4. Run the bot:
   ```bash
   # Development
   bun run dev

   # Production
   bun run start
   ```

## License

ISC
