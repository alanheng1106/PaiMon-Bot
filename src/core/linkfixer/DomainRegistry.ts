import defaultDomains from './defaultDomains';
import type { DomainConfig, ProviderConfig } from './defaultDomains';

export type DomainDefinition = DomainConfig;
export type ProviderDefinition = ProviderConfig;

/**
 * DomainRegistry — Centralized registry for social media domain link fix configurations.
 * Follows Open-Closed Principle (OCP) and Single Responsibility Principle (SRP).
 */
class DomainRegistry {
    #domains = new Map<string, DomainConfig>();

    constructor(initialDomains: DomainConfig[] = defaultDomains) {
        for (const domain of initialDomains) {
            this.register(domain);
        }
    }

    /**
     * Register a new or custom domain fix configuration strategy.
     */
    register(domainConfig: DomainConfig | any): this {
        this.#validateDomainConfig(domainConfig);
        this.#domains.set(domainConfig.id, Object.freeze({ ...domainConfig }));
        return this;
    }

    #validateDomainConfig(domainConfig: any): void {
        if (!domainConfig || typeof domainConfig !== 'object') {
            throw new Error('[DomainRegistry] Invalid domain configuration: Must be an object.');
        }
        if (!domainConfig.id || typeof domainConfig.id !== 'string') {
            throw new Error('[DomainRegistry] Invalid domain configuration: Missing required string property id.');
        }
        if (!Array.isArray(domainConfig.patterns) || domainConfig.patterns.length === 0) {
            throw new Error(
                `[DomainRegistry] Invalid domain configuration: '${domainConfig.id}' must provide a non-empty patterns array.`
            );
        }
        for (const pattern of domainConfig.patterns) {
            if (!(pattern instanceof RegExp)) {
                throw new Error(
                    `[DomainRegistry] Invalid domain configuration: Pattern in '${domainConfig.id}' must be an instance of RegExp.`
                );
            }
        }
        if (domainConfig.providers && !Array.isArray(domainConfig.providers)) {
            throw new Error(
                `[DomainRegistry] Invalid domain configuration: '${domainConfig.id}' providers must be an array.`
            );
        }
    }

    /**
     * Retrieve all registered domain configs as an array.
     */
    getAll(): DomainConfig[] {
        return Array.from(this.#domains.values());
    }

    /**
     * Get a domain configuration by ID.
     */
    getById(id: string): DomainConfig | null {
        return this.#domains.get(id) || null;
    }

    /**
     * Check if a domain ID exists in the registry.
     */
    has(id: string): boolean {
        return this.#domains.has(id);
    }
}

export default DomainRegistry;
