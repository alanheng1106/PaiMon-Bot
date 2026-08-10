const defaultDomains = require('./defaultDomains');

/**
 * DomainRegistry — Centralized registry for social media domain link fix configurations.
 * Follows Open-Closed Principle (OCP) and Single Responsibility Principle (SRP).
 */
class DomainRegistry {
    #domains = new Map();

    constructor(initialDomains = defaultDomains) {
        for (const domain of initialDomains) {
            this.register(domain);
        }
    }

    /**
     * Register a new or custom domain fix configuration strategy.
     * @param {Object} domainConfig 
     */
    register(domainConfig) {
        if (!domainConfig || !domainConfig.id || !domainConfig.patterns) {
            throw new Error('[DomainRegistry] Invalid domain configuration provided.');
        }
        this.#domains.set(domainConfig.id, Object.freeze({ ...domainConfig }));
        return this;
    }

    /**
     * Retrieve all registered domain configs as an array.
     * @returns {Array<Object>}
     */
    getAll() {
        return Array.from(this.#domains.values());
    }

    /**
     * Get a domain configuration by ID.
     * @param {string} id 
     * @returns {Object|null}
     */
    getById(id) {
        return this.#domains.get(id) || null;
    }

    /**
     * Check if a domain ID exists in the registry.
     * @param {string} id 
     * @returns {boolean}
     */
    has(id) {
        return this.#domains.has(id);
    }
}

module.exports = DomainRegistry;
