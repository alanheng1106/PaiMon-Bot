const BaseMetadataScraper = require('./BaseMetadataScraper');

/**
 * DouyinMetadataScraper — Specialized scraper for Douyin (抖音) links.
 * Extracts embedded window._ROUTER_DATA from HTML and resolves direct .mp4 video stream URLs.
 */
class DouyinMetadataScraper extends BaseMetadataScraper {
    canHandle(url) {
        return url.includes('douyin.com');
    }

    async scrape(url, signal) {
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
            const image = item.video?.cover?.url_list?.[0] || item.video?.cover?.[0]?.src || item.images?.[0]?.urlList?.[0] || item.images?.[0]?.url;
            let rawVideo = item.video?.play_addr?.url_list?.[0] || item.video?.playAddr?.[0]?.src;

            const video = await this.#resolveDirectVideoUrl(rawVideo, signal);

            return {
                title,
                description,
                image,
                video: video || image,
                siteName: author,
                color: '#161823'
            };
        } catch (e) {
            console.warn('[DouyinMetadataScraper] Error:', e.message);
            return null;
        }
    }

    async #fetchPage(url, signal) {
        const redirectRes = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
            },
            redirect: 'follow',
            signal
        }).catch(() => null);

        if (!redirectRes || !redirectRes.ok) return null;
        return await redirectRes.text();
    }

    #extractRouterData(html) {
        const startIdx = html.indexOf('window._ROUTER_DATA = ');
        if (startIdx === -1) return null;

        const jsonStart = startIdx + 'window._ROUTER_DATA = '.length;
        const endIdx = html.indexOf('</script>', jsonStart);
        let rawStr = html.slice(jsonStart, endIdx).trim();
        if (rawStr.endsWith(';')) rawStr = rawStr.slice(0, -1);

        try {
            const data = JSON.parse(rawStr);
            const loaderData = data?.loaderData || {};
            const keys = Object.keys(loaderData);
            const key = keys.find(k => k.includes('page') || k.includes('(id)')) || keys[1];
            const pageData = loaderData[key];
            return pageData?.videoInfoRes?.item_list?.[0] || pageData?.videoInfoRes?.itemStruct || pageData?.videoData || null;
        } catch {
            return null;
        }
    }

    async #resolveDirectVideoUrl(video, signal) {
        if (!video) return null;
        video = video.replace('http://', 'https://');
        if (!video.includes('snssdk.com') && !video.includes('iesdouyin.com')) {
            return video;
        }

        try {
            const videoRedir = await fetch(video, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15'
                },
                redirect: 'follow',
                signal
            }).catch(() => null);
            if (videoRedir && videoRedir.url && (videoRedir.url.includes('douyinvod.com') || videoRedir.url.includes('mp4'))) {
                return videoRedir.url;
            }
        } catch (e) {
            console.warn('[DouyinMetadataScraper] Video redirect error:', e.message);
        }
        return video;
    }
}

module.exports = DouyinMetadataScraper;
