import type { ServiceMap } from '../types';

/**
 * ServiceContainer — Centralized Dependency Injection Container.
 * Manages service registration, singleton instances, and clean retrieval.
 */
class ServiceContainer {
    #services = new Map<string, any>();
    #factories = new Map<string, (container: ServiceContainer) => any>();

    /**
     * Register a singleton service instance or factory function.
     */
    register<K extends keyof ServiceMap>(
        name: K,
        instanceOrFactory: ServiceMap[K] | ((container: ServiceContainer) => ServiceMap[K])
    ): this;
    register<T = any>(name: string, instanceOrFactory: T | ((container: ServiceContainer) => T)): this;
    register(name: string, instanceOrFactory: any): this {
        if (typeof instanceOrFactory === 'function') {
            this.#factories.set(name, instanceOrFactory);
        } else {
            this.#services.set(name, instanceOrFactory);
        }
        return this;
    }

    /**
     * Check if a service is registered.
     */
    has(name: string): boolean {
        return this.#services.has(name) || this.#factories.has(name);
    }

    /**
     * Retrieve a service instance by name.
     */
    get<K extends keyof ServiceMap>(name: K): ServiceMap[K];
    get<T = any>(name: string): T;
    get(name: string): any {
        if (this.#services.has(name)) {
            return this.#services.get(name);
        }

        if (this.#factories.has(name)) {
            const factory = this.#factories.get(name)!;
            const instance = factory(this);
            this.#services.set(name, instance);
            this.#factories.delete(name);
            return instance;
        }

        throw new Error(`[ServiceContainer] Service '${name}' is not registered.`);
    }
}

export default ServiceContainer;
