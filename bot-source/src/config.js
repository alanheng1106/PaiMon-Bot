/**
 * Global Configuration Constants
 *
 * All "magic numbers" and tuning knobs live here so they are easy to find,
 * understand, and change without hunting through business-logic files.
 */
module.exports = {
    // ── UI Aesthetic Settings ────────────────────────────────
    Colors: {
        Primary: 0x2b2d31, // Sleek Carbon/Dark Grey
        Error: 0xed4245, // Distinct Red for alerts
        Success: 0x57f287, // Vibrant Green for confirmation
        Warning: 0xfee75c, // Amber Yellow for caution
        Punish: 0xf47b67, // Soft Coral — punitive actions (kick/ban/timeout/warn)
        Info: 0x5865f2, // Discord Blurple — informational queries
        Music: 0x5865f2, // Classic Discord Blurple
        AI: 0xffd21e, // Bright Yellow for Intelligence
        Valorant: 0xfd4556 // Valorant Signature Red
    },

    // ── UI Emojis ────────────────────────────────────────────
    Emojis: {
        Success: '<a:check:1524601509772529665>',
        Error: '<a:cross:1524603300752785550>',
        Warning: '⚠️'
    },

    // ── LinkFixer Settings ───────────────────────────────────
    LinkFixer: {
        MaxCache: 2000, // Maximum tracked fixed messages in LRU cache
        CacheTTL: 1000 * 60 * 60 * 24, // 24 hours
        DefaultCardColor: 0x00AEEC, // Default brand color for embed cards
        MaxDescriptionLength: 2000 // Discord maximum description character limit
    },

    // ── AI / Ollama Settings ────────────────────────────────
    AI: {
        DefaultHost: process.env.OLLAMA_HOST || 'https://ollama.com',
        MaxChannels: 100, // Maximum concurrent conversation channels in LRU cache
        ChatTTL: 1000 * 60 * 60 * 2, // 2 hours — clear history after inactivity
        HistorySize: 20, // Messages to keep per channel (system prompt + recent)
        StreamThrottleMs: 2000, // Minimum interval between Discord message edits during streaming
        MinPassiveLength: 5 // Ignore passive messages shorter than this
    },

    // ── Store Canvas Settings ──────────────────────────────
    StoreCanvas: {
        Width: 1600,
        Height: 800,
        CardWidth: 330,
        CardHeight: 450,
        Gap: 30,
        StartY: 160,
        CornerRadius: 16,
        BgColor: '#101115',
        CardBgColor: '#1c1c24',
        HeaderTitle: '每日優惠',
        DefaultSkinName: '未知造型',
        FontFamily: 'Noto Sans TC',
        VpIconUrl: 'https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png'
    },

    // ── Music / Lavalink Settings ───────────────────────────
    Music: {
        ReconnectTries: 20, // Times to retry connecting to a Lavalink node
        ReconnectIntervalMs: 10000, // 10 seconds between reconnect attempts
        SearchSelectTimeoutMs: 25000, // Song selection menu timeout
        ProgressBarSize: 15 // Character width of the now-playing progress bar
    },

    // ── Valorant Settings ───────────────────────────────────
    Valorant: {
        TokenLifetimeMs: 55 * 60 * 1000, // ~55 min (Riot tokens last ~1 hour)
        SkinCacheTTL: 6 * 60 * 60 * 1000, // 6 hours — skin database cache
        ClientVersionCacheTTL: 30 * 60 * 1000, // 30 minutes — client version cache
        SaveDebounceMs: 500, // Debounce interval for session file writes
        AccountSelectTimeoutMs: 30000 // Selection menu timeout for multi-account accounts
    },

    // ── Guild Settings ──────────────────────────────────────
    Guild: {
        SaveDebounceMs: 500 // Debounce interval for settings file writes
    }
};
