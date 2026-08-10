/**
 * Abstract BaseMetadataScraper Strategy Class.
 */
class BaseMetadataScraper {
    /**
     * Determine if this scraper can handle the given URL.
     * @param {string} url 
     * @returns {boolean}
     */
    canHandle(url) {
        return false;
    }

    /**
     * Scrape OpenGraph / platform metadata from the target URL.
     * @param {string} url 
     * @param {AbortSignal} signal 
     * @returns {Promise<{ title?: string, description?: string, image?: string, video?: string, siteName?: string, color?: string } | null>}
     */
    async scrape(url, signal) {
        throw new Error('BaseMetadataScraper.scrape() must be implemented by subclass.');
    }
}

module.exports = BaseMetadataScraper;
