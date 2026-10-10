/**
 * Event: MessageCreate — Clean event dispatcher pipeline using Chain of Responsibility.
 */

import { Events, Message } from 'discord.js';
import LinkFixHandler from '../handlers/LinkFixHandler';
import TTSHandler from '../handlers/TTSHandler';
import AIStreamHandler from '../handlers/AIStreamHandler';
import MessagePipeline from '../pipeline/MessagePipeline';
import type BotClient from '../core/BotClient';
import type { BotEvent } from '../types';

const pipeline = new MessagePipeline([new LinkFixHandler(), new TTSHandler(), new AIStreamHandler()]);

const messageCreateEvent: BotEvent = {
    name: Events.MessageCreate,
    async execute(message: Message, bot: BotClient) {
        if (message.author.bot) return;

        // Fetch partial message and channel to ensure proper operations in DM
        if (message.partial) {
            try {
                await message.fetch();
            } catch (error) {
                console.error('[Event: messageCreate] Failed to fetch partial message:', error);
                return;
            }
        }

        if (message.channel && message.channel.partial) {
            try {
                // In Discord.js v14, DM channels work directly on partials and calling .fetch() throws on partial DM;
                // only guild channels require fetching.
                const isDM = !message.guild || (typeof (message.channel as any).isDMBased === 'function' && (message.channel as any).isDMBased());
                if (!isDM) {
                    await (message.channel as any).fetch();
                }
            } catch (error) {
                console.warn('[Event: messageCreate] Non-fatal partial channel fetch warning:', error);
            }
        }

        // Execute message handlers through Chain of Responsibility pipeline
        await pipeline.execute(message, bot);
    }
};

export default messageCreateEvent;
