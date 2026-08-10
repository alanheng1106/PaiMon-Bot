/**
 * ServiceContainer — Centralized Dependency Injection Container.
 * Manages service registration, singleton instances, and clean retrieval.
 */
class ServiceContainer {
    #services = new Map();
    #factories = new Map();

    /**
     * Register a singleton service instance or factory function.
     * @param {string} name 
     * @param {any} instanceOrFactory 
     */
    register(name, instanceOrFactory) {
        if (typeof instanceOrFactory === 'function') {
            this.#factories.set(name, instanceOrFactory);
        } else {
            this.#services.set(name, instanceOrFactory);
        }
        return this;
    }

    /**
     * Check if a service is registered.
     * @param {string} name 
     * @returns {boolean}
     */
    has(name) {
        return this.#services.has(name) || this.#factories.has(name);
    }

    /**
     * Retrieve a service instance by name.
     * @param {string} name 
     * @returns {any}
     */
    get(name) {
        if (this.#services.has(name)) {
            return this.#services.get(name);
        }

        if (this.#factories.has(name)) {
            const factory = this.#factories.get(name);
            const instance = factory(this);
            this.#services.set(name, instance);
            this.#factories.delete(name);
            return instance;
        }

        throw new Error(`[ServiceContainer] Service '${name}' is not registered.`);
    }
}

module.exports = ServiceContainer;
