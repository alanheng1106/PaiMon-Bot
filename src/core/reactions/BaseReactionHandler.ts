export interface ReactionContext {
    reaction: any;
    user: any;
    message?: any;
    tracked?: any;
    bot?: any;
}

/**
 * BaseReactionHandler — Abstract strategy base class for reaction actions.
 */
class BaseReactionHandler {
    /**
     * Determine if this strategy can handle the given emoji and guild settings.
     */
    canHandle(_emojiName: string, _settings: any): boolean {
        throw new Error('[BaseReactionHandler] canHandle method must be implemented.');
    }

    /**
     * Execute reaction action strategy.
     */
    async execute(_context: ReactionContext): Promise<void> {
        throw new Error('[BaseReactionHandler] execute method must be implemented.');
    }
}

export default BaseReactionHandler;
