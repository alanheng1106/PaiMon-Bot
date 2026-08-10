# PaiMon-Bot

PaiMon-Bot is a Discord bot built with `discord.js` (Components V2), featuring Lavalink music playback, Ollama LLM chat with Tool-calling & Vision, Valorant daily storefront lookup, and link fixing.

---

## 🌟 Features

- **Discord Slash Commands**: Admin utilities, General commands, Music controls, and Valorant storefront tools.
- **Lavalink Audio Streaming**: Full music player with queue, loop, shuffle, pause, resume, skip, stop, volume, and Now Playing UI cards.
- **AI Chat & Vision**: Powered by Ollama streaming responses, Tool-calling strategy (Web Search, Time queries), vision model support, and Hugging Face text-to-image synthesis.
- **Valorant Store Queries**: Daily storefront inspection, multi-account support, encrypted session storage, and cookie auto-reauthentication.
- **Embedded Link Fixer**: Automatic social media embed fixer (TikTok, Douyin, Twitter/X, Instagram, Bilibili) using strategy-based metadata scrapers and LRU memory safety.
- **Clean OOP & SOLID Architecture**: DDD domain separation, Repository Pattern, Strategy Pattern, Command Router, and Dependency Injection Container.

---

## 🏗️ Architecture & Design Patterns

The codebase is engineered adhering strictly to **OOP (Object-Oriented Programming)** and **SOLID Principles**:

| Subsystem / Pattern | Class / Component | Description |
| :--- | :--- | :--- |
| **Facade Pattern** | `ValorantClient` | High-level orchestrator providing a clean unified facade for Valorant operations while delegating to specialized services. |
| **Repository Pattern** | `FileSessionRepository` | Encapsulates disk persistence (`val-sessions.json`), AES-CBC encryption/decryption, and in-memory session state. |
| **Strategy Pattern** | `RiotAuthenticator` | Encapsulates Riot RSO HTTP authentication endpoints, token URI parsing, and cookie reauthentication. |
| **Domain Service** | `ValorantStoreService` | Handles storefront API calls, client version resolution, and weapon skin metadata catalog lookup. |
| **Single Responsibility** | `ImageSynthesisService` | Dedicated service for Hugging Face Text-to-Image synthesis and image URL base64 conversions. |
| **Presenter Pattern** | `BotResponsePresenter` | Dedicated presentation layer constructing structured Error & Success UI containers for Discord interactions. |
| **Command / Router** | `ComponentRouter` | Dispatches Discord button and modal UI interactions to specialized component handlers (`ValUrlButtonHandler`, `ValUrlModalHandler`). |
| **Chain of Responsibility** | `MessagePipeline` | Filters and dispatches incoming messages sequentially through registered handlers (`LinkFixHandler`, `TTSHandler`, `AIStreamHandler`). |
| **Dependency Injection** | `ServiceContainer` | Central IoC container managing singleton lifecycle resolution for services. |

---

## 📁 Project Structure

```text
.
├── bot-source/
│   ├── index.js
│   ├── package.json
│   ├── src/
│   │   ├── builders/          ← ComponentV2 UI Card Builders
│   │   ├── commands/          ← Slash command definitions (admin, general, music, valorant)
│   │   ├── core/
│   │   │   ├── AIClient.js    ← LLM inference & tool orchestration
│   │   │   ├── BotClient.js   ← Core Discord Client orchestrator
│   │   │   ├── ValorantClient.js ← High-level Valorant Facade
│   │   │   ├── ai/            ← FilePromptProvider, ImageSynthesisService
│   │   │   ├── bot/           ← CommandLoader, EventLoader, BotResponsePresenter
│   │   │   ├── components/    ← ComponentRouter, ValUrlButtonHandler, ValUrlModalHandler
│   │   │   ├── linkfixer/     ← DomainRegistry, default domain configurations
│   │   │   ├── music/         ← MusicPresenter (Audio UI cards)
│   │   │   ├── scrapers/      ← BaseMetadataScraper, DouyinMetadataScraper, DefaultOGScraper
│   │   │   ├── tools/         ← ToolRegistry, BaseTool, GetCurrentTimeTool, WebSearchTool
│   │   │   └── valorant/      ← FileSessionRepository, RiotAuthenticator, ValorantStoreService
│   │   ├── events/            ← InteractionCreate, MessageCreate, Ready, MessageReactionAdd
│   │   ├── handlers/          ← AIStreamHandler, LinkFixHandler, TTSHandler
│   │   ├── pipeline/          ← BaseMessageHandler, MessagePipeline
│   │   └── utils/             ← DiscordSanitizer
│   └── tests/                 ← Node.js native unit test runner suite (50+ unit tests)
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🧪 Running Unit Tests

Unit tests use Node.js native test runner (`node --test`). To run all tests:

```bash
cd bot-source
npm test
```

Test coverage includes:
- `ServiceContainer` DI resolution
- `ToolRegistry` & `ComponentRouter` strategy dispatching
- `FileSessionRepository` AES encryption & persistence
- `RiotAuthenticator` token URI parsing
- `ValorantClient` facade integration
- `LinkFixer` LRU Cache memory safety
- `MessagePipeline` chain execution
- `MusicPresenter` & `StoreCanvas` RGB color math

---

## 🚀 Setup & Execution

### 1. Requirements

- Node.js 20.x or higher
- Docker & Docker Compose (optional for Lavalink container setup)
- Discord Bot Token & Application ID

### 2. Configuration

Clone the repository and copy `.env.example`:

```bash
git clone git@github.com:alanheng1106/PaiMon-Bot.git
cd PaiMon-Bot
cp bot-source/.env.example .env
```

Configure `.env`:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id
OWNER_ID=your_discord_user_id

LAVALINK_HOST=lavalink
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
```

### 3. Run Locally

```bash
cd bot-source
npm install
npm start
```

### 4. Run With Docker Compose

```bash
docker compose up --build
```
