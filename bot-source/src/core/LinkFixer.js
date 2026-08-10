/**
 * LinkFixer — Comprehensive embed-fix engine for social media links.
 * 
 * Refactored for clean OOP / SOLID compliance:
 * - Domain configurations decoupled into DomainRegistry (DIP & OCP)
 * - Internal state encapsulated via ES2022 private fields (#)
 * - Metadata scraping strategy dispatch (Strategy Pattern)
 */

const { LRUCache } = require('lru-cache');
const DomainRegistry = require('./linkfixer/DomainRegistry');
const DouyinMetadataScraper = require('./scrapers/DouyinMetadataScraper');
const DefaultOGMetadataScraper = require('./scrapers/DefaultOGMetadataScraper');

class LinkFixer {
    #domainRegistry;
    #scrapers = [];
    #fixedMessages;

    constructor(domainRegistryOrDomains = null, scrapers = []) {
        if (domainRegistryOrDomains instanceof DomainRegistry) {
            this.#domainRegistry = domainRegistryOrDomains;
        } else if (Array.isArray(domainRegistryOrDomains)) {
            // Backward compatibility fallback for legacy array initialization
            this.#domainRegistry = new DomainRegistry(domainRegistryOrDomains);
        } else {
            this.#domainRegistry = new DomainRegistry();
        }

        // Memory Leak Prevention: Use LRU Cache with TTL (max 2000 entries, 24h expiration)
        this.#fixedMessages = new LRUCache({
            max: 2000,
            ttl: 86400000
        });

        // Strategy Pattern: Register metadata scrapers
        this.#scrapers = scrapers.length > 0 ? scrapers : [
            new DouyinMetadataScraper(),
            new DefaultOGMetadataScraper()
        ];
    }

    /**
     * Get read-only list of domains from registry.
     */
    get domains() {
        return this.#domainRegistry.getAll();
    }

    /**
     * Access fixed messages LRU cache instance (read-only reference).
     */
    get fixedMessages() {
        return this.#fixedMessages;
    }

    /**
     * Register a custom metadata scraper strategy (DIP / Open-Closed Principle).
     * @param {BaseMetadataScraper} scraper 
     */
    registerScraper(scraper) {
        this.#scrapers.unshift(scraper);
    }

    trackFixedMessage(messageId, metadata) {
        this.#fixedMessages.set(messageId, {
            ...metadata,
            createdAt: Date.now()
        });
    }

    getFixedMessage(messageId) {
        return this.#fixedMessages.get(messageId);
    }

    forgetFixedMessage(messageId) {
        this.#fixedMessages.delete(messageId);
    }

    isIgnored(rawContent, urlMatch) {
        const dollarRegex = new RegExp(`\\$${escapeRegExp(urlMatch)}`, 'i');
        if (dollarRegex.test(rawContent)) return true;

        const angleRegex = new RegExp(`<${escapeRegExp(urlMatch)}>`, 'i');
        if (angleRegex.test(rawContent)) return true;

        const spoilerRegex = new RegExp(`\\|\\|\\s*${escapeRegExp(urlMatch)}\\s*\\|\\|`, 'i');
        if (spoilerRegex.test(rawContent)) return true;

        return false;
    }

    async process(content, options = {}) {
        const {
            disabledDomains = [],
            enabledDomains = [],
            domainProviders = {}
        } = options;

        const fixedLinks = [];
        const items = [];
        const seen = new Set();
        let replacedContent = content;
        let modified = false;

        const currentDomains = this.#domainRegistry.getAll();

        for (const domain of currentDomains) {
            const isEnabled = domain.enabledByDefault
                ? !disabledDomains.includes(domain.id)
                : enabledDomains.includes(domain.id);

            if (!isEnabled) continue;

            const providerId = domainProviders[domain.id];
            const provider = domain.providers.find(p => p.id === providerId) ||
                domain.providers.find(p => p.default) ||
                domain.providers[0];

            if (!provider || !provider.replacements) continue;

            for (const pattern of domain.patterns) {
                const matches = Array.from(content.matchAll(pattern));
                for (const match of matches) {
                    let originalUrl = match[0].replace(/[>.),;]+$/, '');

                    if (seen.has(originalUrl)) continue;
                    if (this.isIgnored(content, originalUrl)) continue;

                    seen.add(originalUrl);

                    const fixedUrl = this._applyReplacement(originalUrl, provider.replacements);
                    if (fixedUrl) {
                        fixedLinks.push(fixedUrl);
                        items.push({
                            originalUrl,
                            fixedUrl,
                            domainId: domain.id,
                            domainName: domain.name,
                            color: domain.color,
                            providerId: provider.id,
                            providerName: provider.name
                        });
                        replacedContent = replacedContent.replace(originalUrl, fixedUrl);
                        modified = true;
                    }
                }
            }
        }

        return { fixedLinks, items, replacedContent, modified };
    }

    reverseParse(fixedUrl) {
        const currentDomains = this.#domainRegistry.getAll();
        for (const domain of currentDomains) {
            for (const provider of domain.providers) {
                for (const r of provider.replacements) {
                    if (fixedUrl.includes(r.new)) {
                        const originalUrl = fixedUrl.replace(r.new, r.old);
                        return { domain, provider, originalUrl };
                    }
                }
            }
        }
        return null;
    }

    getNextProvider(domainId, currentProviderId) {
        const domain = this.#domainRegistry.getById(domainId);
        if (!domain || domain.providers.length <= 1) return null;

        const index = domain.providers.findIndex(p => p.id === currentProviderId);
        if (index === -1) return domain.providers[0];

        const nextIndex = (index + 1) % domain.providers.length;
        return domain.providers[nextIndex];
    }

    /**
     * Fetch OpenGraph metadata from a fixed URL using Strategy Pattern dispatch.
     */
    async fetchOGMetadata(url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        try {
            const scraper = this.#scrapers.find(s => s.canHandle(url)) || new DefaultOGMetadataScraper();
            return await scraper.scrape(url, controller.signal);
        } catch (e) {
            return null;
        } finally {
            clearTimeout(timeout);
        }
    }

    /** @private */
    _applyReplacement(urlStr, replacements) {
        if (!replacements || replacements.length === 0) {
            return urlStr;
        }
        try {
            const urlObj = new URL(urlStr);
            const hostname = urlObj.hostname;

            for (const r of replacements) {
                if (hostname === r.old || hostname.endsWith('.' + r.old)) {
                    if (r.new.includes('/')) {
                        const parts = r.new.split('/');
                        urlObj.hostname = parts[0];
                        const extraPath = '/' + parts.slice(1).join('/');
                        urlObj.pathname = extraPath + (urlObj.pathname === '/' ? '' : urlObj.pathname);
                    } else {
                        urlObj.hostname = r.new;
                    }
                    return urlObj.toString();
                }
            }
        } catch (e) {
            for (const r of replacements) {
                if (urlStr.includes(r.old)) {
                    return urlStr.replace(new RegExp(`(www\\.)?${escapeRegExp(r.old)}`, 'gi'), r.new);
                }
            }
        }
        return null;
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = LinkFixer;
