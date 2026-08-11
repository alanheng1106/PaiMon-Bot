/**
 * LinkFixer — Comprehensive embed-fix engine for social media links.
 * 
 * Refactored for clean OOP / SOLID compliance:
 * - Domain configurations decoupled into DomainRegistry (DIP & OCP)
 * - Internal state encapsulated via ES2022 private fields (#)
 * - Metadata scraping strategy dispatch (Strategy Pattern)
 */

const { LRUCache } = require('lru-cache');
const { LinkFixer: LinkFixConfig } = require('../config');
const DomainRegistry = require('./linkfixer/DomainRegistry');
const LinkProviderRotator = require('./linkfixer/LinkProviderRotator');
const DouyinMetadataScraper = require('./scrapers/DouyinMetadataScraper');
const DefaultOGMetadataScraper = require('./scrapers/DefaultOGMetadataScraper');
const DiscordSanitizer = require('../utils/DiscordSanitizer');

class LinkFixer {
    #domainRegistry;
    #rotator;
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

        this.#rotator = new LinkProviderRotator(this.#domainRegistry, (urlStr, replacements) =>
            this.#applyReplacement(urlStr, replacements)
        );

        // Memory Leak Prevention: Use LRU Cache with TTL from config
        const maxCache = LinkFixConfig?.MaxCache || 2000;
        const cacheTTL = LinkFixConfig?.CacheTTL || 86400000;

        this.#fixedMessages = new LRUCache({
            max: maxCache,
            ttl: cacheTTL
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
        const escaped = DiscordSanitizer.escapeRegExp(urlMatch);
        if (new RegExp(`\\$${escaped}`, 'i').test(rawContent)) return true;
        if (new RegExp(`<${escaped}>`, 'i').test(rawContent)) return true;
        if (new RegExp(`\\|\\|\\s*${escaped}\\s*\\|\\|`, 'i').test(rawContent)) return true;

        return false;
    }

    rotateLinkProvider(fixedUrl) {
        return this.#rotator.rotateLinkProvider(fixedUrl);
    }

    async process(content, options = {}) {
        const fixedLinks = [];
        const items = [];
        const seen = new Set();
        let replacedContent = content;
        let modified = false;

        const currentDomains = this.#domainRegistry.getAll();

        for (const domain of currentDomains) {
            const provider = this.#resolveProviderForDomain(domain, options);
            if (!provider) continue;

            const res = this.#processDomainPatterns(content, domain, provider, seen, replacedContent);
            if (res.modified) {
                fixedLinks.push(...res.fixedLinks);
                items.push(...res.items);
                replacedContent = res.replacedContent;
                modified = true;
            }
        }

        return { fixedLinks, items, replacedContent, modified };
    }

    #resolveProviderForDomain(domain, options) {
        const { disabledDomains = [], enabledDomains = [], domainProviders = {} } = options;
        const isEnabled = domain.enabledByDefault
            ? !disabledDomains.includes(domain.id)
            : enabledDomains.includes(domain.id);

        if (!isEnabled) return null;

        const providerId = domainProviders[domain.id];
        const provider = domain.providers.find(p => p.id === providerId) ||
            domain.providers.find(p => p.default) ||
            domain.providers[0];

        return (provider && provider.replacements) ? provider : null;
    }

    #processDomainPatterns(content, domain, provider, seen, currentReplaced) {
        const fixedLinks = [];
        const items = [];
        let replacedContent = currentReplaced;
        let modified = false;

        for (const pattern of domain.patterns) {
            const matches = Array.from(content.matchAll(pattern));
            for (const match of matches) {
                let originalUrl = match[0].replace(/[>.),;]+$/, '');

                if (seen.has(originalUrl)) continue;
                if (this.isIgnored(content, originalUrl)) continue;

                seen.add(originalUrl);

                const fixedUrl = this.#applyReplacement(originalUrl, provider.replacements);
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

        return { fixedLinks, items, replacedContent, modified };
    }

    reverseParse(fixedUrl) {
        return this.#rotator.reverseParse(fixedUrl);
    }

    getNextProvider(domainId, currentProviderId) {
        return this.#rotator.getNextProvider(domainId, currentProviderId);
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
    #applyReplacement(urlStr, replacements) {
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
                    return urlStr.replace(new RegExp(`(www\\.)?${DiscordSanitizer.escapeRegExp(r.old)}`, 'gi'), r.new);
                }
            }
        }
        return null;
    }
}

module.exports = LinkFixer;
