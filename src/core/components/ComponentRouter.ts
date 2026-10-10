import BaseComponentHandler from './BaseComponentHandler';
import type { Interaction } from 'discord.js';

/**
 * ComponentRouter — Centralized Router for Discord Buttons, Modals, and Select Menus.
 * Eliminates monolithic if-else blocks in interaction listeners.
 */
class ComponentRouter {
    #handlers = new Map<string, BaseComponentHandler>();

    /**
     * Register a component handler.
     */
    register(handler: BaseComponentHandler): this {
        if (!(handler instanceof BaseComponentHandler)) {
            throw new TypeError('[ComponentRouter] Registered handler must extend BaseComponentHandler.');
        }
        this.#handlers.set(handler.customId, handler);
        return this;
    }

    /**
     * Check if a customId has a registered handler.
     */
    has(customId: string): boolean {
        if (this.#handlers.has(customId)) return true;
        for (const handler of this.#handlers.values()) {
            if (handler.matches(customId)) return true;
        }
        return false;
    }

    /**
     * Route an incoming interaction to its registered handler.
     */
    async handle(interaction: Interaction | any, bot: any): Promise<boolean> {
        const customId = interaction.customId;
        if (!customId) return false;

        const exactHandler = this.#handlers.get(customId);
        if (exactHandler) {
            await exactHandler.execute(interaction, bot);
            return true;
        }

        for (const handler of this.#handlers.values()) {
            if (handler.matches(customId)) {
                await handler.execute(interaction, bot);
                return true;
            }
        }

        return false;
    }
}

export default ComponentRouter;
