/**
 * LinkFixer — Comprehensive embed-fix engine for social media links.
 *
 * Refactored for clean OOP / SOLID compliance:
 * - Domain configurations decoupled into DomainRegistry (DIP & OCP)
 * - Internal state encapsulated via ES2022 private fields (#)
 * - Metadata scraping strategy dispatch (Strategy Pattern)
 */

import { LRUCache } from 'lru-cache';
import { LinkFixer as LinkFixConfig } from '../config';
import DomainRegistry, { DomainDefinition, ProviderDefinition } from './linkfixer/DomainRegistry';
import LinkProviderRotator from './linkfixer/LinkProviderRotator';
import BaseMetadataScraper, { ScrapedMetadata } from './scrapers/BaseMetadataScraper';
import DouyinMetadataScraper from './scrapers/DouyinMetadataScraper';
import DefaultOGMetadataScraper from './scrapers/DefaultOGMetadataScraper';
import DiscordSanitizer from '../utils/DiscordSanitizer';

export interface FixedMessageMeta {
    createdAt?: number;
    [key: string]: any;
}

export interface LinkFixProcessOptions {
    disabledDomains?: string[];
    enabledDomains?: string[];
    domainProviders?: Record<string, string>;
}

export interface LinkFixItem {
    originalUrl: string;
    fixedUrl: string;
    domainId: string;
    domainName: string;
    color: string | number;
    providerId: string;
    providerName: string;
}

export interface LinkFixResult {
    fixedLinks: string[];
    items: LinkFixItem[];
    replacedContent: string;
    modified: boolean;
}

class LinkFixer {
    #domainRegistry: DomainRegistry;
    #rotator: LinkProviderRotator;
    #scrapers: BaseMetadataScraper[] = [];
    #fixedMessages: LRUCache<string, FixedMessageMeta>;

    constructor(
        domainRegistryOrDomains: DomainRegistry | DomainDefinition[] | null = null,
        scrapers: BaseMetadataScraper[] = []
    ) {
        if (domainRegistryOrDomains instanceof DomainRegistry) {
            this.#domainRegistry = domainRegistryOrDomains;
        } else if (Array.isArray(domainRegistryOrDomains)) {
            // Backward compatibility fallback for legacy array initialization
            this.#domainRegistry = new DomainRegistry(domainRegistryOrDomains);
        } else {
            this.#domainRegistry = new DomainRegistry();
        }

        this.#rotator = new LinkProviderRotator(
            this.#domainRegistry,
            (urlStr: string, replacements: any[]) => this.#applyReplacement(urlStr, replacements) || urlStr
        );

        // Memory Leak Prevention: Use LRU Cache with TTL from config
        const maxCache = LinkFixConfig?.MaxCache || 2000;
        const cacheTTL = LinkFixConfig?.CacheTTL || 86400000;

        this.#fixedMessages = new LRUCache<string, FixedMessageMeta>({
            max: maxCache,
            ttl: cacheTTL
        });

        // Strategy Pattern: Register metadata scrapers
        this.#scrapers = scrapers.length > 0 ? scrapers : [new DouyinMetadataScraper(), new DefaultOGMetadataScraper()];
    }

    /**
     * Get read-only list of domains from registry.
     */
    get domains(): readonly DomainDefinition[] {
        return this.#domainRegistry.getAll();
    }

    /**
     * Access fixed messages LRU cache instance (read-only reference).
     */
    get fixedMessages(): LRUCache<string, FixedMessageMeta> {
        return this.#fixedMessages;
    }

    /**
     * Register a custom metadata scraper strategy (DIP / Open-Closed Principle).
     */
    registerScraper(scraper: BaseMetadataScraper): void {
        this.#scrapers.unshift(scraper);
    }

    trackFixedMessage(messageId: string, metadata: Record<string, any>): void {
        this.#fixedMessages.set(messageId, {
            ...metadata,
            createdAt: Date.now()
        });
    }

    getFixedMessage(messageId: string): FixedMessageMeta | undefined {
        return this.#fixedMessages.get(messageId);
    }

    forgetFixedMessage(messageId: string): void {
        this.#fixedMessages.delete(messageId);
    }

    isIgnored(rawContent: string, urlMatch: string): boolean {
        const escaped = DiscordSanitizer.escapeRegExp(urlMatch);
        if (new RegExp(`\\$${escaped}`, 'i').test(rawContent)) return true;
        if (new RegExp(`<${escaped}>`, 'i').test(rawContent)) return true;
        if (new RegExp(`\\|\\|\\s*${escaped}\\s*\\|\\|`, 'i').test(rawContent)) return true;

        return false;
    }

    rotateLinkProvider(fixedUrl: string) {
        return this.#rotator.rotateLinkProvider(fixedUrl);
    }

    async process(content: string, options: LinkFixProcessOptions = {}): Promise<LinkFixResult> {
        const fixedLinks: string[] = [];
        const items: LinkFixItem[] = [];
        const seen = new Set<string>();
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

    #resolveProviderForDomain(domain: DomainDefinition, options: LinkFixProcessOptions): ProviderDefinition | null {
        const { disabledDomains = [], enabledDomains = [], domainProviders = {} } = options;
        const isEnabled = domain.enabledByDefault
            ? !disabledDomains.includes(domain.id)
            : enabledDomains.includes(domain.id);

        if (!isEnabled) return null;

        const providerId = domainProviders[domain.id];
        const provider =
            domain.providers.find((p) => p.id === providerId) ||
            domain.providers.find((p) => p.default) ||
            domain.providers[0];

        return provider && provider.replacements ? provider : null;
    }

    #processDomainPatterns(
        content: string,
        domain: DomainDefinition,
        provider: ProviderDefinition,
        seen: Set<string>,
        currentReplaced: string
    ) {
        const fixedLinks: string[] = [];
        const items: LinkFixItem[] = [];
        let replacedContent = currentReplaced;
        let modified = false;

        for (const pattern of domain.patterns) {
            const matches = Array.from(content.matchAll(pattern));
            for (const match of matches) {
                const originalUrl = match[0].replace(/[>.),;]+$/, '');

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

    reverseParse(fixedUrl: string) {
        return this.#rotator.reverseParse(fixedUrl);
    }

    getNextProvider(domainId: string, currentProviderId: string) {
        return this.#rotator.getNextProvider(domainId, currentProviderId);
    }

    /**
     * Fetch OpenGraph metadata from a fixed URL using Strategy Pattern dispatch.
     */
    async fetchOGMetadata(url: string): Promise<ScrapedMetadata | null> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        try {
            const scraper = this.#scrapers.find((s) => s.canHandle(url)) || new DefaultOGMetadataScraper();
            return await scraper.scrape(url, controller.signal);
        } catch {
            return null;
        } finally {
            clearTimeout(timeout);
        }
    }

    /** @private */
    #applyReplacement(urlStr: string, replacements?: Array<{ old: string; new: string }>): string | null {
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
        } catch {
            for (const r of replacements) {
                if (urlStr.includes(r.old)) {
                    return urlStr.replace(new RegExp(`(www\\.)?${DiscordSanitizer.escapeRegExp(r.old)}`, 'gi'), r.new);
                }
            }
        }
        return null;
    }
}

export default LinkFixer;
