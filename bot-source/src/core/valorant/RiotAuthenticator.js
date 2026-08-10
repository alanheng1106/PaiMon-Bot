/**
 * RiotAuthenticator — Encapsulates Riot RSO authentication, cookie reauth, and user identity endpoints.
 * Refactored for clean Strategy Pattern & Single Responsibility Principle (SRP).
 */

const AUTH_URL = 'https://auth.riotgames.com/api/v1/authorization';
const ENTITLEMENTS_URL = 'https://entitlements.auth.riotgames.com/api/token/v1';
const USERINFO_URL = 'https://auth.riotgames.com/userinfo';
const RIOT_GEO_URL = 'https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant';

const DEFAULT_HEADERS = {
    'User-Agent': 'RiotClient/65.0.4.5022105.4789131 rso-auth (Windows;10;;Professional, x64)',
    Accept: 'application/json, text/plain, */*'
};

const REGION_TO_SHARD = {
    na: 'na',
    latam: 'na',
    br: 'na',
    eu: 'eu',
    ap: 'ap',
    kr: 'kr',
    pbe: 'pbe'
};

class RiotAuthenticator {
    /**
     * Parse access_token from the redirect URI fragment.
     */
    parseTokenFromUri(uri) {
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
     * Cookie-based reauth (silent token refresh, no password needed).
     */
    async cookieReauth(cookies) {
        try {
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

            const newCookies = this.#mergeCookies(cookies, this.#extractCookies(cookieRes));
            const data = await cookieRes.json();

            if (data.type === 'response') {
                const tokens = this.parseTokenFromUri(data.response.parameters.uri);
                return { ...tokens, cookies: newCookies };
            }

            return null;
        } catch (err) {
            console.error('[RiotAuthenticator] cookieReauth error:', err);
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
            console.warn('[RiotAuthenticator] Geo lookup failed, defaulting to AP:', err.message);
            return { region: 'ap', shard: 'ap' };
        }
    }

    /** @private */
    #extractCookies(response) {
        const setCookies = response.headers.getSetCookie?.() || [];
        return setCookies.map((c) => c.split(';')[0]).join('; ');
    }

    /** @private */
    #mergeCookies(existing, newCookies) {
        const cookieMap = {};
        if (existing) {
            existing.split('; ').forEach((c) => {
                const [name, ...rest] = c.split('=');
                if (name) cookieMap[name.trim()] = rest.join('=');
            });
        }
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
}

module.exports = RiotAuthenticator;
