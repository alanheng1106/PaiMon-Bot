/**
 * Global Configuration Constants
 *
 * All "magic numbers" and tuning knobs live here so they are easy to find,
 * understand, and change without hunting through business-logic files.
 */

export const Colors = {
    Primary: 0x2b2d31, // Sleek Carbon/Dark Grey
    Error: 0xed4245, // Distinct Red for alerts
    Success: 0x57f287, // Vibrant Green for confirmation
    Warning: 0xfee75c, // Amber Yellow for caution
    Punish: 0xf47b67, // Soft Coral — punitive actions (kick/ban/timeout/warn)
    Info: 0x5865f2, // Discord Blurple — informational queries
    Music: 0x5865f2, // Classic Discord Blurple
    AI: 0xffd21e // Bright Yellow for Intelligence
} as const;

export const Emojis = {
    Success: '<a:check:1524601509772529665>',
    Error: '<a:cross:1524603300752785550>',
    Warning: '<a:cross:1524603300752785550>',
    Loading: '<a:loading:1551489203013947422>',
    // AI Model Custom Emojis
    ChatGPT: '<:chatgpt:1552673091241508945>',
    DeepSeek: '<:deepseek:1552670847406313562>',
    Gemini: '<:gemini:1552670563749724302>',
    Qwen: '<:qwen:1552672304461254737>',
    Grok: '<:grok:1553008331390722048>',
    // Platform Custom Emojis
    VTC: '<:vtc:1552676338052239400>',
    Ollama: '<:ollama:1552675730943385730>',
    MeowAI: '<:meowai:1553012543189024799>'
} as const;

export const LinkFixer = {
    DefaultCardColor: 0x00aeec, // Default brand color for embed cards
    MaxDescriptionLength: 2000 // Discord maximum description character limit
} as const;

export const AI = {
    MaxChannels: 100, // Maximum concurrent conversation channels in LRU cache
    ChatTTL: 1000 * 60 * 60 * 2, // 2 hours — clear history after inactivity
    HistorySize: 30, // Multi-turn conversation context history depth
    StreamThrottleMs: 2000, // Minimum interval between Discord message edits during streaming
    MinPassiveLength: 5, // Ignore passive messages shorter than this
    MaxToolIterations: 50, // Maximum tool execution rounds (50 = enough to fully page through a 10,000-line file in 200-line chunks)
    // Inference Recommended Parameters
    Temperature: 1.0,
    TopP: 0.95,
    TopK: 64,
    NumCtx: Number(process.env.AI_NUM_CTX || process.env.OLLAMA_NUM_CTX) || 32768, // Default 32k context window
    EnableThinking: process.env.AI_ENABLE_THINKING === 'true', // Global thinking mode toggle
    Disclaimer: process.env.AI_DISCLAIMER || '-# {emoji}  •  {model}  •  {provider}',
    // Image Generation Settings
    DefaultImageModel: process.env.VTC_IMAGE_MODEL || 'gpt-image-2',
    DefaultImageSize: '3840x2160', // 4K UHD resolution
    // Multi-Platform Gateway Settings (Windowsed / VTC GenAI, OpenAI, vLLM, LiteLLM)
    get WindowsedAIBaseUrl() {
        return (
            process.env.WINDOWSED_AI_BASE_URL ||
            process.env.VTC_AI_BASE_URL ||
            process.env.CUSTOM_AI_BASE_URL ||
            process.env.OPENAI_BASE_URL ||
            process.env.FRIEND_AI_BASE_URL ||
            'https://ai.windowsed.me/v1'
        );
    },
    get WindowsedAIApiKey() {
        return (
            process.env.WINDOWSED_AI_API_KEY ||
            process.env.VTC_AI_API_KEY ||
            process.env.CUSTOM_AI_API_KEY ||
            process.env.OPENAI_API_KEY ||
            process.env.FRIEND_AI_API_KEY ||
            ''
        );
    },
    get WindowsedAIModel() {
        return (
            process.env.WINDOWSED_AI_MODEL ||
            process.env.VTC_AI_MODEL ||
            process.env.CUSTOM_AI_MODEL ||
            process.env.FRIEND_AI_MODEL ||
            'deepseek-v4-pro-thinking'
        );
    },
    get WindowsedAIName() {
        return (
            process.env.WINDOWSED_AI_NAME ||
            process.env.VTC_AI_NAME ||
            process.env.CUSTOM_AI_NAME ||
            process.env.FRIEND_AI_NAME ||
            'VTC GenAI'
        );
    }
};

export const Music = {
    ReconnectTries: 20, // Times to retry connecting to a Lavalink node
    ReconnectIntervalMs: 10000, // 10 seconds between reconnect attempts
    SearchSelectTimeoutMs: 25000, // Song selection menu timeout
    ProgressBarSize: 15 // Character width of the now-playing progress bar
} as const;

export const Guild = {
    SaveDebounceMs: 500 // Debounce interval for settings file writes
} as const;

const config = {
    Colors,
    Emojis,
    LinkFixer,
    AI,
    Music,
    Guild
};

export default config;
