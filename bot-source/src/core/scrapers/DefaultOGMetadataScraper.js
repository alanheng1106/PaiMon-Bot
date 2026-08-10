const BaseMetadataScraper = require('./BaseMetadataScraper');

/**
 * DefaultOGMetadataScraper — Universal OpenGraph meta tag parser.
 */
class DefaultOGMetadataScraper extends BaseMetadataScraper {
    canHandle(url) {
        return true; // Fallback for all URLs
    }

    async scrape(url, signal) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
                },
                signal
            }).catch(() => null);

            if (!res || !res.ok) return null;
            const html = await res.text();

            const getMeta = (prop) => {
                const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
                          html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["']`, 'i'));
                return m ? this._unescapeHtml(m[1]) : null;
            };

            const title = getMeta('title') || getMeta('twitter:title');
            const description = getMeta('description') || getMeta('twitter:description');
            const image = getMeta('image') || getMeta('twitter:image') || getMeta('image:src');
            const video = getMeta('video') || getMeta('video:url') || getMeta('video:secure_url') || getMeta('twitter:player:stream');
            const siteName = getMeta('site_name');
            const color = getMeta('theme-color');

            return { title, description, image, video, siteName, color };
        } catch (e) {
            return null;
        }
    }

    _unescapeHtml(str) {
        if (!str) return str;
        return str
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");
    }
}

module.exports = DefaultOGMetadataScraper;
