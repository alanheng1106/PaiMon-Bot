import BaseMetadataScraper, { ScrapedMetadata } from './BaseMetadataScraper';

/**
 * DefaultOGMetadataScraper — Universal OpenGraph meta tag parser.
 */
class DefaultOGMetadataScraper extends BaseMetadataScraper {
    override canHandle(_url: string): boolean {
        return true; // Fallback for all URLs
    }

    override async scrape(url: string, signal?: AbortSignal): Promise<ScrapedMetadata | null> {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
                },
                signal
            }).catch(() => null);

            if (!res || !res.ok) return null;
            const html = await this.readBoundedHtml(res);
            if (!html) return null;

            const getMeta = (prop: string) => {
                const m =
                    html.match(
                        new RegExp(
                            `<meta[^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["'][^>]+content=["']([^"']+)["']`,
                            'i'
                        )
                    ) ||
                    html.match(
                        new RegExp(
                            `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:|twitter:)?${prop}["']`,
                            'i'
                        )
                    );
                return m ? this._unescapeHtml(m[1]) : null;
            };

            const title = getMeta('title') || getMeta('twitter:title') || undefined;
            const description = getMeta('description') || getMeta('twitter:description') || undefined;
            const image = getMeta('image') || getMeta('twitter:image') || getMeta('image:src') || undefined;
            const video =
                getMeta('video') ||
                getMeta('video:url') ||
                getMeta('video:secure_url') ||
                getMeta('twitter:player:stream') ||
                undefined;
            const siteName = getMeta('site_name') || undefined;
            const color = getMeta('theme-color') || undefined;

            return { title, description, image, video, siteName, color };
        } catch (e: any) {
            console.warn('[DefaultOGMetadataScraper] Scrape error:', e.message);
            return null;
        }
    }

    _unescapeHtml(str: string | null): string | null {
        if (!str) return str;
        return str
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");
    }
}

export default DefaultOGMetadataScraper;
