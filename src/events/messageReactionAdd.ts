import { Events, MessageReaction, User } from 'discord.js';
import type BotClient from '../core/BotClient';
import type { BotEvent } from '../types';

const messageReactionAddEvent: BotEvent = {
    name: Events.MessageReactionAdd,
    async execute(reaction: MessageReaction, user: User, bot: BotClient) {
        const router = bot?.container?.get('reactionRouter') || (bot as any)?.reactionRouter;
        if (router) {
            await router.handle({ reaction, user, bot });
        }
    }
};

export default messageReactionAddEvent;
