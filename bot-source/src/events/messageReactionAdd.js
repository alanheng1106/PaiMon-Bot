const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user, bot) {
        if (user.bot) return;

        // Fetch partial reaction or message if needed
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                return;
            }
        }
        if (reaction.message.partial) {
            try {
                await reaction.message.fetch();
            } catch (error) {
                return;
            }
        }

        const message = reaction.message;
        if (!message.guild) return;

        const tracked = bot.linkFixer.getFixedMessage(message.id);
        if (!tracked) return;

        const settings = bot.settings.getLinkFixerSettings(message.guild.id);
        const emojiName = reaction.emoji.name;

        // ── 1. Delete Fixed Message Reaction (❌) ─────────────────
        if (emojiName === settings.deleteMsgEmoji) {
            const member = message.guild.members.cache.get(user.id) || await message.guild.members.fetch(user.id).catch(() => null);
            const isAuthor = user.id === tracked.authorId;
            const canManage = member && member.permissions.has('ManageMessages');

            if (isAuthor || canManage) {
                try {
                    await message.delete();
                    bot.linkFixer.forgetFixedMessage(message.id);
                } catch (err) {
                    console.warn('[LinkFixer Delete Reaction] Failed to delete message:', err.message);
                }
            }
            return;
        }

        // ── 2. Rotate Provider Reaction (🔄) ──────────────────────
        if (emojiName === settings.rotateFixEmoji) {
            if (user.id !== tracked.authorId) return;

            const newFixedLinks = [];
            let changed = false;

            for (const link of tracked.fixedLinks) {
                const parsed = bot.linkFixer.reverseParse(link);
                if (parsed) {
                    const nextProvider = bot.linkFixer.getNextProvider(parsed.domain.id, parsed.provider.id);
                    if (nextProvider && nextProvider.replacements) {
                        const newLink = bot.linkFixer._applyReplacement(parsed.originalUrl, nextProvider.replacements);
                        if (newLink && newLink !== link) {
                            newFixedLinks.push(newLink);
                            changed = true;
                            continue;
                        }
                    }
                }
                newFixedLinks.push(link);
            }

            if (changed) {
                try {
                    // Update content if sent via webhook or message edit
                    if (message.webhookId) {
                        const webhook = await bot.fetchWebhook(message.webhookId).catch(() => null);
                        if (webhook) {
                            await webhook.editMessage(message.id, {
                                content: newFixedLinks.join('\n')
                            });
                        } else {
                            await message.edit({ content: newFixedLinks.join('\n') });
                        }
                    } else {
                        await message.edit({ content: newFixedLinks.join('\n') });
                    }

                    tracked.fixedLinks = newFixedLinks;
                    bot.linkFixer.trackFixedMessage(message.id, tracked);
                } catch (err) {
                    console.warn('[LinkFixer Rotate Reaction] Failed to edit message:', err.message);
                }
            }

            // Remove user reaction so they can click again
            try {
                await reaction.users.remove(user.id);
            } catch (err) {
                // Ignore missing permissions to remove user reaction
            }
        }
    }
};
