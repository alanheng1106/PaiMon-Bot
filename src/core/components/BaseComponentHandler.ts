import type { Interaction } from 'discord.js';

/**
 * BaseComponentHandler — Abstract Base Class for Discord Buttons, Modals, and Select Menus.
 * Enforces Command/Router Pattern & Open-Closed Principle (OCP).
 */
class BaseComponentHandler {
    /**
     * Unique customId or customId prefix handled by this component.
     */
    get customId(): string {
        throw new Error('[BaseComponentHandler] customId must be implemented by subclass.');
    }

    /**
     * Determine if this handler should handle the given customId.
     * Defaults to exact match or prefix match with ':' separator.
     */
    matches(customId: string): boolean {
        return customId === this.customId || customId.startsWith(`${this.customId}:`);
    }

    /**
     * Execute interaction logic.
     */
    async execute(_interaction: Interaction | any, _bot: any): Promise<void> {
        throw new Error('[BaseComponentHandler] execute() must be implemented by subclass.');
    }
}

export default BaseComponentHandler;
