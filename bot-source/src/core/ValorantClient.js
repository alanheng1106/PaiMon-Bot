const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Valorant: ValConfig } = require('../config');

const encryptionSource = process.env.ENCRYPTION_KEY || process.env.DISCORD_TOKEN;
if (!encryptionSource) {
    console.error('[Valorant] WARNING: No ENCRYPTION_KEY or DISCORD_TOKEN set. Session encryption will be ineffective!');
} else if (!process.env.ENCRYPTION_KEY) {
    console.warn('[Valorant] ENCRYPTION_KEY not set, falling back to DISCORD_TOKEN. Set a dedicated ENCRYPTION_KEY for better security.');
}

const ENCRYPTION_KEY = crypto
    .createHash('sha256')
    .update(String(encryptionSource || 'no-key-configured'))
    .digest();
const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (e) {
        return text;
    }
}

function decrypt(text) {
    if (text.trim().startsWith('{')) return text; // Plaintext JSON fallback
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        throw new Error('Decryption failed, invalid key or corrupted data');
    }
}

/**
 * Valorant API Client
 * Handles Riot authentication, session management, and store queries.
 * Sessions are persisted to disk (data/val-sessions.json).
 * Tokens auto-refresh via cookie reauth when expired.
 */

const AUTH_URL = 'https://auth.riotgames.com/api/v1/authorization';
const ENTITLEMENTS_URL = 'https://entitlements.auth.riotgames.com/api/token/v1';
const USERINFO_URL = 'https://auth.riotgames.com/userinfo';
const RIOT_GEO_URL = 'https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant';
const VALORANT_API_BASE = 'https://valorant-api.com/v1';

const DEFAULT_HEADERS = {
    'User-Agent': 'RiotClient/65.0.4.5022105.4789131 rso-auth (Windows;10;;Professional, x64)',
    Accept: 'application/json, text/plain, */*'
};

// Base64-encoded client platform header (standard PC platform)
const CLIENT_PLATFORM =
    'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9';

// Valorant currency UUIDs
const VP_UUID = '85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741';

// Shard lookup from region
const REGION_TO_SHARD = {
    na: 'na',
    latam: 'na',
    br: 'na',
    eu: 'eu',
    ap: 'ap',
    kr: 'kr',
    pbe: 'pbe'
};

class ValorantClient {
    constructor() {
        this.dataDir = path.join(__dirname, '..', '..', 'data');
        this.filePath = path.join(this.dataDir, 'val-sessions.json');
        this.sessions = {};
        this.pendingMfa = new Map(); // discordUserId -> { cookies, accessToken, ... }
        this._debounceTimer = null;
        this._clientVersionCache = null;
        this._clientVersionCacheTime = 0;
        this._skinCache = null;
        this._skinCacheTime = 0;
        this._load();
    }

    // ─── Persistence ─────────────────────────────────────────

    _load() {
        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }
            if (fs.existsSync(this.filePath)) {
                const encryptedData = fs.readFileSync(this.filePath, 'utf8');
                if (encryptedData.trim()) {
                    const decryptedData = decrypt(encryptedData);
                    this.sessions = JSON.parse(decryptedData);
                }
            }
        } catch (err) {
            console.error('[Valorant] Failed to load sessions:', err.message);
            this.sessions = {};
        }
    }

    _save() {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._writeSync();
        }, ValConfig.SaveDebounceMs);
    }

    // ─── Session Management ──────────────────────────────────

    /**
     * Add or update a session for a user's Riot account.
     */
    addSession(discordUserId, riotId, sessionData) {
        if (!this.sessions[discordUserId]) {
            this.sessions[discordUserId] = {};
        }
        this.sessions[discordUserId][riotId] = {
            ...sessionData,
            tokenExpiresAt: Date.now() + ValConfig.TokenLifetimeMs
        };
        this._save();
    }

    /**
     * Get all sessions for a Discord user.
     * Returns { riotId: sessionData } or null.
     */
    getSessions(discordUserId) {
        const userSessions = this.sessions[discordUserId];
        if (!userSessions || Object.keys(userSessions).length === 0) return null;
        return userSessions;
    }

    /**
     * Get a specific session, auto-refreshing if token is expired.
     * Returns sessionData or null.
     */
    async getValidSession(discordUserId, riotId) {
        const userSessions = this.sessions[discordUserId];
        if (!userSessions || !userSessions[riotId]) return null;

        const session = userSessions[riotId];

        // Check if token is expired
        if (Date.now() >= session.tokenExpiresAt) {
            console.log(`[Valorant] Token expired for ${riotId}, attempting cookie reauth...`);
            try {
                const refreshed = await this.cookieReauth(session.cookies);
                if (!refreshed) {
                    // Cookie reauth failed, remove session
                    this.removeSession(discordUserId, riotId);
                    return null;
                }

                // Get new entitlements token
                const entitlementsToken = await this.getEntitlementsToken(refreshed.accessToken);

                // Update session with new tokens
                session.accessToken = refreshed.accessToken;
                session.entitlementsToken = entitlementsToken;
                session.cookies = refreshed.cookies;
                session.tokenExpiresAt = Date.now() + ValConfig.TokenLifetimeMs;
                this._save();
                console.log(`[Valorant] Cookie reauth successful for ${riotId}`);
            } catch (err) {
                console.error(`[Valorant] Cookie reauth failed for ${riotId}:`, err.message);
                this.removeSession(discordUserId, riotId);
                return null;
            }
        }

        return session;
    }

    /**
     * Remove a specific session.
     */
    removeSession(discordUserId, riotId) {
        if (this.sessions[discordUserId]) {
            delete this.sessions[discordUserId][riotId];
            if (Object.keys(this.sessions[discordUserId]).length === 0) {
                delete this.sessions[discordUserId];
            }
            this._save();
        }
    }

    /**
     * Remove all sessions for a Discord user.
     */
    removeAllSessions(discordUserId) {
        delete this.sessions[discordUserId];
        this._save();
    }

    // ─── Riot Authentication ─────────────────────────────────

    /**
     * Extract cookies from set-cookie headers.
     */
    _extractCookies(response) {
        const setCookies = response.headers.getSetCookie?.() || [];
        return setCookies.map((c) => c.split(';')[0]).join('; ');
    }

    /**
     * Merge new cookies into existing cookie string.
     */
    _mergeCookies(existing, newCookies) {
        const cookieMap = {};
        // Parse existing
        if (existing) {
            existing.split('; ').forEach((c) => {
                const [name, ...rest] = c.split('=');
                if (name) cookieMap[name.trim()] = rest.join('=');
            });
        }
        // Parse new (overwrite)
        if (newCookies) {
            newCookies.split('; ').forEach((c) => {
                const [name, ...rest] = c.split('=');
                if (name) cookieMap[name.trim()] = rest.join('=');
            });
        }
        return Object.entries(cookieMap)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    /**
     * Parse access_token from the redirect URI fragment.
     */
    _parseTokenFromUri(uri) {
        const url = new URL(uri);
        const fragment = url.hash.substring(1);
        const params = new URLSearchParams(fragment);
        return {
            accessToken: params.get('access_token'),
            idToken: params.get('id_token'),
            expiresIn: parseInt(params.get('expires_in') || '3600')
        };
    }

    /**
     * Login using a redirected auth URL from the browser.
     * Returns complete session data or error.
     */
    async loginWithUrl(discordUserId, authUrl) {
        try {
            // Parse tokens from URL
            const tokens = this._parseTokenFromUri(authUrl);

            if (!tokens.accessToken || !tokens.idToken) {
                return { error: '網址無效或缺少授權 Token, 請確認是否複製完整.' };
            }

            const authResult = {
                accessToken: tokens.accessToken,
                idToken: tokens.idToken,
                cookies: ''
            };

            return this._completeLogin(discordUserId, authResult);
        } catch (err) {
            console.error('[Valorant] loginWithUrl error:', err);
            return { error: `網址解析失敗: ${err.message}` };
        }
    }

    /**
     * Cookie-based reauth (silent token refresh, no password needed).
     * Returns { accessToken, idToken, cookies } or null on failure.
     */
    async cookieReauth(cookies) {
        try {
            // Re-initialize the auth session
            const cookieRes = await fetch(AUTH_URL, {
                method: 'POST',
                headers: {
                    ...DEFAULT_HEADERS,
                    'Content-Type': 'application/json',
                    Cookie: cookies
                },
                body: JSON.stringify({
                    client_id: 'riot-client',
                    nonce: '1',
                    redirect_uri: 'http://localhost/redirect',
                    response_type: 'token id_token',
                    scope: 'account openid'
                }),
                redirect: 'manual'
            });

            const newCookies = this._mergeCookies(cookies, this._extractCookies(cookieRes));
            const data = await cookieRes.json();

            if (data.type === 'response') {
                const tokens = this._parseTokenFromUri(data.response.parameters.uri);
                return { ...tokens, cookies: newCookies };
            }

            // If it returns auth or multifactor, cookies have expired
            return null;
        } catch (err) {
            console.error('[Valorant] cookieReauth error:', err);
            return null;
        }
    }

    /**
     * Get entitlements token from access token.
     */
    async getEntitlementsToken(accessToken) {
        const res = await fetch(ENTITLEMENTS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`
            },
            body: '{}'
        });
        const data = await res.json();
        return data.entitlements_token;
    }

    /**
     * Get player info (PUUID, game name, tag line).
     */
    async getPlayerInfo(accessToken) {
        const res = await fetch(USERINFO_URL, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await res.json();
        return {
            puuid: data.sub,
            gameName: data.acct?.game_name || '未知',
            tagLine: data.acct?.tag_line || '???'
        };
    }

    /**
     * Get the player's region/shard via Riot Geo endpoint.
     */
    async getRiotGeo(accessToken, idToken) {
        try {
            const res = await fetch(RIOT_GEO_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`
                },
                body: JSON.stringify({ id_token: idToken })
            });
            const data = await res.json();
            const region = data.affinities?.live || 'ap';
            return {
                region,
                shard: REGION_TO_SHARD[region] || 'ap'
            };
        } catch (err) {
            console.warn('[Valorant] Geo lookup failed, defaulting to AP:', err.message);
            return { region: 'ap', shard: 'ap' };
        }
    }

    /**
     * Complete login after successful auth.
     */
    async _completeLogin(discordUserId, authResult) {
        try {
            const { accessToken, idToken, cookies } = authResult;

            // Get entitlements token
            const entitlementsToken = await this.getEntitlementsToken(accessToken);

            // Get player info
            const playerInfo = await this.getPlayerInfo(accessToken);
            const riotId = `${playerInfo.gameName}#${playerInfo.tagLine}`;

            // Get shard/region
            const geo = await this.getRiotGeo(accessToken, idToken);

            // Build session
            const sessionData = {
                accessToken,
                entitlementsToken,
                puuid: playerInfo.puuid,
                riotId,
                shard: geo.shard,
                region: geo.region,
                cookies
            };

            // Store session
            this.addSession(discordUserId, riotId, sessionData);

            return { success: true, riotId, shard: geo.shard, region: geo.region };
        } catch (err) {
            console.error('[Valorant] _completeLogin error:', err);
            return { error: `登入完成階段失敗: ${err.message}` };
        }
    }

    // ─── Store Queries ───────────────────────────────────────

    /**
     * Get current Valorant client version from valorant-api.com.
     * Cached for 30 minutes.
     */
    async getClientVersion() {
        if (this._clientVersionCache && Date.now() - this._clientVersionCacheTime < ValConfig.ClientVersionCacheTTL) {
            return this._clientVersionCache;
        }
        try {
            const res = await fetch(`${VALORANT_API_BASE}/version`);
            const data = await res.json();
            this._clientVersionCache = data.data?.riotClientVersion || 'release-09.00-shipping-18-2594470';
            this._clientVersionCacheTime = Date.now();
            return this._clientVersionCache;
        } catch (err) {
            console.warn('[Valorant] Failed to fetch client version, using fallback:', err.message);
            return 'release-09.00-shipping-18-2594470';
        }
    }

    /**
     * Get the player's daily storefront.
     * Returns { skins: [{ uuid }], remainingSeconds } or throws.
     */
    async getStorefront(session) {
        const clientVersion = await this.getClientVersion();

        const res = await fetch(`https://pd.${session.shard}.a.pvp.net/store/v3/storefront/${session.puuid}`, {
            method: 'POST',
            body: '{}',
            headers: {
                Authorization: `Bearer ${session.accessToken}`,
                'X-Riot-Entitlements-JWT': session.entitlementsToken,
                'Content-Type': 'application/json',
                'X-Riot-ClientPlatform': CLIENT_PLATFORM,
                'X-Riot-ClientVersion': clientVersion
            }
        });

        if (!res.ok) {
            throw new Error(`商店查詢失敗 (HTTP ${res.status})`);
        }

        const data = await res.json();
        const dailyOffers = data.SkinsPanelLayout;

        const prices = new Map();
        for (const offer of dailyOffers?.SingleItemStoreOffers || []) {
            const cost = offer.Cost?.[VP_UUID];
            if (cost !== undefined) {
                prices.set(offer.OfferID, cost);
            }
        }

        return {
            skinUuids: dailyOffers?.SingleItemOffers || [],
            remainingSeconds: dailyOffers?.SingleItemOffersRemainingDurationInSeconds || 0,
            prices
        };
    }

    /**
     * Load all weapon skins from valorant-api.com and their rarities.
     * Cached for 6 hours.
     */
    async _loadSkinDatabase() {
        if (this._skinCache && Date.now() - this._skinCacheTime < ValConfig.SkinCacheTTL) {
            return this._skinCache;
        }

        const [resLevels, resSkins, resTiers] = await Promise.all([
            fetch(`${VALORANT_API_BASE}/weapons/skinlevels?language=zh-TW`),
            fetch(`${VALORANT_API_BASE}/weapons/skins`),
            fetch(`${VALORANT_API_BASE}/contenttiers`)
        ]);

        const dataLevels = await resLevels.json();
        const dataSkins = await resSkins.json();
        const dataTiers = await resTiers.json();

        // Build Tier map
        const tierMap = new Map();
        for (const tier of dataTiers.data || []) {
            let color = tier.highlightColor || 'ffffff';
            // Valorant API hex is sometimes RRGGBB or RRGGBBAA or AARRGGBB, typically we just need #RRGGBB
            color = '#' + color.substring(0, 6);
            tierMap.set(tier.uuid, { name: tier.devName, color });
        }

        // Build Skin -> Tier map
        const skinToTierMap = new Map();
        for (const skin of dataSkins.data || []) {
            if (skin.contentTierUuid) {
                for (const level of skin.levels || []) {
                    skinToTierMap.set(level.uuid.toLowerCase(), skin.contentTierUuid);
                }
            }
        }

        const skinMap = new Map();
        for (const level of dataLevels.data || []) {
            const uuid = level.uuid.toLowerCase();
            const tierUuid = skinToTierMap.get(uuid);
            const tierInfo = tierUuid ? tierMap.get(tierUuid) : { name: 'Unknown', color: '#888888' };

            skinMap.set(uuid, {
                displayName: level.displayName,
                displayIcon: level.displayIcon,
                tierName: tierInfo?.name || 'Unknown',
                tierColor: tierInfo?.color || '#888888'
            });
        }

        this._skinCache = skinMap;
        this._skinCacheTime = Date.now();
        return skinMap;
    }

    /**
     * Resolve skin UUIDs to display info (name + icon).
     * Returns [{ uuid, displayName, displayIcon }].
     */
    async getSkinDetails(skinUuids) {
        const skinDb = await this._loadSkinDatabase();

        return skinUuids.map((uuid) => {
            const info = skinDb.get(uuid.toLowerCase());
            return {
                uuid,
                displayName: info?.displayName || '未知造型',
                displayIcon: info?.displayIcon || null,
                tierName: info?.tierName || 'Unknown',
                tierColor: info?.tierColor || '#888888'
            };
        });
    }

    /**
     * Immediately persist sessions to disk and cancel any pending debounce.
     * Used during graceful shutdown to avoid data loss.
     */
    flush() {
        clearTimeout(this._debounceTimer);
        this._writeSync();
    }

    /** @private */
    _writeSync() {
        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }
            const rawData = JSON.stringify(this.sessions, null, 2);
            const encryptedData = encrypt(rawData);
            fs.writeFileSync(this.filePath, encryptedData, 'utf8');
        } catch (err) {
            console.error('[Valorant] Failed to save sessions:', err.message);
        }
    }
}

module.exports = ValorantClient;
