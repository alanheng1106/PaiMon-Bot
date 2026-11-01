export interface ScrapedMetadata {
    title?: string;
    description?: string;
    image?: string;
    video?: string;
    siteName?: string;
    color?: string;
}

/**
 * Abstract BaseMetadataScraper Strategy Class.
 */
class BaseMetadataScraper {
    /**
     * Determine if this scraper can handle the given URL.
     */
    canHandle(_url: string): boolean {
        return false;
    }

    /**
     * Scrape OpenGraph / platform metadata from the target URL.
     */
    async scrape(_url: string, _signal?: AbortSignal): Promise<ScrapedMetadata | null> {
        throw new Error('BaseMetadataScraper.scrape() must be implemented by subclass.');
    }

    /**
     * Read response HTML up to maxBytes to prevent OOM on large/binary responses.
     */
    protected async readBoundedHtml(res: Response, maxBytes: number = 256 * 1024): Promise<string | null> {
        const contentType = res.headers?.get?.('content-type') || '';
        if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
            return null;
        }
        if (!res.body || typeof res.body.getReader !== 'function') {
            const text = await res.text();
            return text.slice(0, maxBytes);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let result = '';
        let bytesRead = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const remaining = maxBytes - bytesRead;
                const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value;
                bytesRead += slice.byteLength;
                result += decoder.decode(slice, { stream: true });
                if (bytesRead >= maxBytes) {
                    await reader.cancel().catch(() => {});
                    break;
                }
            }
            result += decoder.decode();
        } finally {
            reader.releaseLock();
        }
        return result;
    }
}

export default BaseMetadataScraper;
