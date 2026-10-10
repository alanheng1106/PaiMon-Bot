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
}

export default BaseMetadataScraper;
