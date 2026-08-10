const { Valorant: ValConfig } = require('../../config');

const VALORANT_API_BASE = 'https://valorant-api.com/v1';
const CLIENT_PLATFORM =
    'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9';
const VP_UUID = '85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741';

/**
 * ValorantStoreService — Handles storefront API calls and skin database catalog details.
 * Refactored for clean SRP and API abstraction.
 */
class ValorantStoreService {
    #clientVersionCache = null;
    #clientVersionCacheTime = 0;
    #skinCache = null;
    #skinCacheTime = 0;

    /**
     * Get current Valorant client version from valorant-api.com.
     */
    async getClientVersion() {
        if (this.#clientVersionCache && Date.now() - this.#clientVersionCacheTime < ValConfig.ClientVersionCacheTTL) {
            return this.#clientVersionCache;
        }
        try {
            const res = await fetch(`${VALORANT_API_BASE}/version`);
            const data = await res.json();
            this.#clientVersionCache = data.data?.riotClientVersion || 'release-09.00-shipping-18-2594470';
            this.#clientVersionCacheTime = Date.now();
            return this.#clientVersionCache;
        } catch (err) {
            console.warn('[ValorantStoreService] Failed to fetch client version, using fallback:', err.message);
            return 'release-09.00-shipping-18-2594470';
        }
    }

    /**
     * Get the player's daily storefront.
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
     * Resolve skin UUIDs to display info (name + icon + tier).
     */
    async getSkinDetails(skinUuids) {
        const skinDb = await this.#loadSkinDatabase();

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

    /** @private */
    async #loadSkinDatabase() {
        if (this.#skinCache && Date.now() - this.#skinCacheTime < ValConfig.SkinCacheTTL) {
            return this.#skinCache;
        }

        const [resLevels, resSkins, resTiers] = await Promise.all([
            fetch(`${VALORANT_API_BASE}/weapons/skinlevels?language=zh-TW`),
            fetch(`${VALORANT_API_BASE}/weapons/skins`),
            fetch(`${VALORANT_API_BASE}/contenttiers`)
        ]);

        const dataLevels = await resLevels.json();
        const dataSkins = await resSkins.json();
        const dataTiers = await resTiers.json();

        const tierMap = new Map();
        for (const tier of dataTiers.data || []) {
            let color = tier.highlightColor || 'ffffff';
            color = '#' + color.substring(0, 6);
            tierMap.set(tier.uuid, { name: tier.devName, color });
        }

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

        this.#skinCache = skinMap;
        this.#skinCacheTime = Date.now();
        return skinMap;
    }
}

module.exports = ValorantStoreService;
