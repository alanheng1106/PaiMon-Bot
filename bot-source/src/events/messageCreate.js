/**
 * Event: MessageCreate — Clean event dispatcher pipeline using Chain of Responsibility.
 */

const { Events } = require('discord.js');
const LinkFixHandler = require('../handlers/LinkFixHandler');
const TTSHandler = require('../handlers/TTSHandler');
const AIStreamHandler = require('../handlers/AIStreamHandler');
const MessagePipeline = require('../pipeline/MessagePipeline');

const pipeline = new MessagePipeline([
    new LinkFixHandler(),
    new TTSHandler(),
    new AIStreamHandler()
]);

module.exports = {
    name: Events.MessageCreate,
    async execute(message, bot) {
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
                await message.channel.fetch();
            } catch (error) {
                console.error('[Event: messageCreate] Failed to fetch partial channel:', error);
                return;
            }
        }

        // Execute message handlers through Chain of Responsibility pipeline
        await pipeline.execute(message, bot);
    }
};

