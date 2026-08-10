const { Valorant: ValConfig } = require('../config');
const FileSessionRepository = require('./valorant/FileSessionRepository');
const RiotAuthenticator = require('./valorant/RiotAuthenticator');
const ValorantStoreService = require('./valorant/ValorantStoreService');

/**
 * ValorantClient — High-level domain facade for Valorant operations.
 * Refactored for clean OOP / SOLID compliance:
 * - Persistence delegated to FileSessionRepository (SRP & DIP)
 * - RSO Auth delegated to RiotAuthenticator (SRP & Strategy Pattern)
 * - Store & catalog queries delegated to ValorantStoreService (SRP)
 * - Internal components encapsulated via ES2022 private fields (#)
 */
class ValorantClient {
    #sessionRepo;
    #authenticator;
    #storeService;

    constructor(options = {}) {
        this.#sessionRepo = options.sessionRepo || new FileSessionRepository();
        this.#authenticator = options.authenticator || new RiotAuthenticator();
        this.#storeService = options.storeService || new ValorantStoreService();
    }

    get sessionRepo() {
        return this.#sessionRepo;
    }

    get authenticator() {
        return this.#authenticator;
    }

    get storeService() {
        return this.#storeService;
    }

    // ─── Session Management ──────────────────────────────────

    addSession(discordUserId, riotId, sessionData) {
        this.#sessionRepo.setSession(discordUserId, riotId, sessionData);
    }

    getSessions(discordUserId) {
        return this.#sessionRepo.getUserSessions(discordUserId);
    }

    async getValidSession(discordUserId, riotId) {
        const session = this.#sessionRepo.getSession(discordUserId, riotId);
        if (!session) return null;

        if (Date.now() >= session.tokenExpiresAt) {
            console.log(`[ValorantClient] Token expired for ${riotId}, attempting cookie reauth...`);
            try {
                const refreshed = await this.#authenticator.cookieReauth(session.cookies);
                if (!refreshed) {
                    this.#sessionRepo.removeSession(discordUserId, riotId);
                    return null;
                }

                const entitlementsToken = await this.#authenticator.getEntitlementsToken(refreshed.accessToken);
                const updatedSession = {
                    ...session,
                    accessToken: refreshed.accessToken,
                    entitlementsToken,
                    cookies: refreshed.cookies,
                    tokenExpiresAt: Date.now() + ValConfig.TokenLifetimeMs
                };
                this.#sessionRepo.setSession(discordUserId, riotId, updatedSession);
                console.log(`[ValorantClient] Cookie reauth successful for ${riotId}`);
                return updatedSession;
            } catch (err) {
                console.error(`[ValorantClient] Cookie reauth failed for ${riotId}:`, err.message);
                this.#sessionRepo.removeSession(discordUserId, riotId);
                return null;
            }
        }

        return session;
    }

    removeSession(discordUserId, riotId) {
        this.#sessionRepo.removeSession(discordUserId, riotId);
    }

    removeAllSessions(discordUserId) {
        this.#sessionRepo.removeAllSessions(discordUserId);
    }

    // ─── Authentication Flow ─────────────────────────────────

    async loginWithUrl(discordUserId, authUrl) {
        try {
            const tokens = this.#authenticator.parseTokenFromUri(authUrl);

            if (!tokens.accessToken || !tokens.idToken) {
                return { error: '網址無效或缺少授權 Token, 請確認是否複製完整.' };
            }

            return await this._completeLogin(discordUserId, {
                accessToken: tokens.accessToken,
                idToken: tokens.idToken,
                cookies: ''
            });
        } catch (err) {
            console.error('[ValorantClient] loginWithUrl error:', err);
            return { error: `網址解析失敗: ${err.message}` };
        }
    }

    async _completeLogin(discordUserId, authResult) {
        try {
            const { accessToken, idToken, cookies } = authResult;

            const entitlementsToken = await this.#authenticator.getEntitlementsToken(accessToken);
            const playerInfo = await this.#authenticator.getPlayerInfo(accessToken);
            const riotId = `${playerInfo.gameName}#${playerInfo.tagLine}`;
            const geo = await this.#authenticator.getRiotGeo(accessToken, idToken);

            const sessionData = {
                accessToken,
                entitlementsToken,
                puuid: playerInfo.puuid,
                riotId,
                shard: geo.shard,
                region: geo.region,
                cookies
            };

            this.addSession(discordUserId, riotId, sessionData);

            return { success: true, riotId, shard: geo.shard, region: geo.region };
        } catch (err) {
            console.error('[ValorantClient] _completeLogin error:', err);
            return { error: `登入完成階段失敗: ${err.message}` };
        }
    }

    // ─── Store Queries ───────────────────────────────────────

    async getStorefront(session) {
        return await this.#storeService.getStorefront(session);
    }

    async getSkinDetails(skinUuids) {
        return await this.#storeService.getSkinDetails(skinUuids);
    }

    flush() {
        this.#sessionRepo.flush();
    }
}

module.exports = ValorantClient;
