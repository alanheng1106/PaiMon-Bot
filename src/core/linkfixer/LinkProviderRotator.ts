import DomainRegistry from './DomainRegistry';
import type { DomainConfig, ProviderConfig, ReplacementRule } from './defaultDomains';

export interface ReverseParseResult {
    domain: DomainConfig;
    provider: ProviderConfig;
    originalUrl: string;
}

/**
 * LinkProviderRotator — Encapsulates provider reverse parsing and provider rotation logic.
 * Refactored for Single Responsibility Principle (SRP).
 */
class LinkProviderRotator {
    #domainRegistry: DomainRegistry;
    #applyReplacementFn: (url: string, replacements: ReplacementRule[]) => string;

    constructor(
        domainRegistry: DomainRegistry,
        applyReplacementFn: (url: string, replacements: ReplacementRule[]) => string
    ) {
        if (!domainRegistry) throw new Error('[LinkProviderRotator] DomainRegistry instance is required.');
        this.#domainRegistry = domainRegistry;
        this.#applyReplacementFn = applyReplacementFn;
    }

    /**
     * Reverse parse a fixed URL to retrieve original domain and provider info.
     */
    reverseParse(fixedUrl: string): ReverseParseResult | null {
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

    /**
     * Get the next provider for a domain in circular sequence.
     */
    getNextProvider(domainId: string, currentProviderId: string): ProviderConfig | null {
        const domain = this.#domainRegistry.getById(domainId);
        if (!domain || domain.providers.length <= 1) return null;

        const index = domain.providers.findIndex((p: ProviderConfig) => p.id === currentProviderId);
        if (index === -1) return domain.providers[0];

        const nextIndex = (index + 1) % domain.providers.length;
        return domain.providers[nextIndex];
    }

    /**
     * Rotate link provider to the next available strategy.
     */
    rotateLinkProvider(fixedUrl: string): string | null {
        const parsed = this.reverseParse(fixedUrl);
        if (!parsed) return null;

        const nextProvider = this.getNextProvider(parsed.domain.id, parsed.provider.id);
        if (!nextProvider || !nextProvider.replacements) return null;

        const newLink = this.#applyReplacementFn(parsed.originalUrl, nextProvider.replacements);
        return newLink && newLink !== fixedUrl ? newLink : null;
    }
}

export default LinkProviderRotator;
