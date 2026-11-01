import BaseMetadataScraper, { ScrapedMetadata } from './BaseMetadataScraper';

/**
 * DouyinMetadataScraper — Specialized scraper for Douyin (抖音) links.
 * Extracts embedded window._ROUTER_DATA from HTML and resolves direct .mp4 video stream URLs.
 */
class DouyinMetadataScraper extends BaseMetadataScraper {
    override canHandle(url: string): boolean {
        return url.includes('douyin.com');
    }

    override async scrape(url: string, signal?: AbortSignal): Promise<ScrapedMetadata | null> {
        try {
            const html = await this.#fetchPage(url, signal);
            if (!html) return null;

            const item = this.#extractRouterData(html);
            if (!item) return null;

            const title = item.desc || '抖音短影音';
            const author = item.author?.nickname || '抖音創作者';
            const likes = item.statistics?.digg_count || item.stats?.diggCount || 0;
            const comments = item.statistics?.comment_count || item.stats?.commentCount || 0;
            const shares = item.statistics?.share_count || item.stats?.shareCount || 0;
            const description = `❤️ ${likes}  💬 ${comments}  🔁 ${shares}\n\n${title}`;
            const image =
                item.video?.cover?.url_list?.[0] ||
                item.video?.cover?.[0]?.src ||
                item.images?.[0]?.urlList?.[0] ||
                item.images?.[0]?.url;
            const rawVideo = item.video?.play_addr?.url_list?.[0] || item.video?.playAddr?.[0]?.src;

            const video = await this.#resolveDirectVideoUrl(rawVideo, signal);

            return {
                title,
                description,
                image,
                video: video || image,
                siteName: author,
                color: '#161823'
            };
        } catch (e: any) {
            console.warn('[DouyinMetadataScraper] Error:', e.message);
            return null;
        }
    }

    async #fetchPage(url: string, signal?: AbortSignal): Promise<string | null> {
        const redirectRes = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
            },
            redirect: 'follow',
            signal
        }).catch(() => null);

        if (!redirectRes || !redirectRes.ok) return null;
        return await this.readBoundedHtml(redirectRes, 512 * 1024);
    }

    #extractRouterData(html: string): any {
        const scriptMatch =
            html.match(/<script[^>]*id=["']RENDER_DATA["'][^>]*>([\s\S]*?)<\/script>/i) ||
            html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\});<\/script>/i);
        if (!scriptMatch) return null;

        try {
            const rawJson = scriptMatch[1].trim();
            const decoded = rawJson.startsWith('%') ? decodeURIComponent(rawJson) : rawJson;
            const data = JSON.parse(decoded);
            const loaderData = data.loaderData || data;
            const item =
                loaderData?.['video_(id)/page']?.videoInfoRes?.item_list?.[0] ||
                loaderData?.['note_(id)/page']?.videoInfoRes?.item_list?.[0] ||
                data?.item_list?.[0];
            return item || null;
        } catch (e: any) {
            console.warn('[DouyinMetadataScraper] JSON parse error:', e.message);
            return null;
        }
    }

    async #resolveDirectVideoUrl(rawVideo: string | undefined, signal?: AbortSignal): Promise<string | null> {
        if (!rawVideo) return null;
        let v = rawVideo.replace(/^http:/, 'https:');
        if (v.includes('aweme.snssdk.com')) {
            v = v.replace('/playwm/', '/play/');
        }

        try {
            const videoRedir = await fetch(v, {
                method: 'GET',
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                    Referer: 'https://www.douyin.com/'
                },
                redirect: 'follow',
                signal
            }).catch(() => null);
            if (
                videoRedir &&
                videoRedir.url &&
                (videoRedir.url.includes('douyinvod.com') || videoRedir.url.includes('mp4'))
            ) {
                return videoRedir.url;
            }
        } catch (e: any) {
            console.warn('[DouyinMetadataScraper] Video redirect error:', e.message);
        }
        return v;
    }
}

export default DouyinMetadataScraper;
