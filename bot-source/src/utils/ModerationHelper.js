const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder, MessageFlags } = require('discord.js');
const { Colors, Emojis } = require('../config');

/**
 * ModerationHelper — Reusable utilities for admin moderation commands.
 * Follows Single Responsibility Principle (SRP) and DRY principles.
 */
class ModerationHelper {
    /**
     * Validate target member for moderation action.
     * @param {import('discord.js').Interaction} interaction 
     * @param {Object} bot 
     * @param {import('discord.js').User} user 
     * @param {import('discord.js').GuildMember|null} member 
     * @param {Object} [options]
     * @returns {string|null} Error string if validation failed, null if valid.
     */
    static validateTarget(interaction, bot, user, member, options = {}) {
        const { actionName = '執行此操作' } = options;

        if (user.id === interaction.user.id) {
            return '你不能對你自己執行此操作!';
        }
        if (user.id === bot.user.id) {
            return '我沒辦法對我自己執行此操作!';
        }
        if (user.id === interaction.guild.ownerId) {
            return '你不能對伺服器擁有者執行此操作!';
        }

        if (member) {
            if (
                interaction.member.roles.highest.position <= member.roles.highest.position &&
                interaction.guild.ownerId !== interaction.user.id
            ) {
                return `你的最高身分組不高於 **${user.tag}**, 無法${actionName}`;
            }
        }

        return null;
    }

    /**
     * Best-effort DM notification to moderation target.
     * @param {import('discord.js').User} user 
     * @param {string} actionMessage 
     * @param {string} reason 
     */
    static async notifyTarget(user, actionMessage, reason) {
        return await user
            .send(`${actionMessage}\n📋 原因: \`${reason}\``)
            .catch((e) => console.warn('[ModerationHelper] DM notification failed:', e.message));
    }

    /**
     * Build standard moderation container payload.
     * @param {Object} params
     * @param {string} params.title
     * @param {number} [params.color]
     * @param {import('discord.js').User} params.user
     * @param {import('discord.js').User} params.executor
     * @param {string} params.reason
     * @param {Array<string>} [params.extraFields]
     * @returns {Object} Discord payload with components and flags
     */
    static buildPunishmentCard({ title, color = Colors.Punish, user, executor, reason, extraFields = [] }) {
        const timestamp = Math.floor(Date.now() / 1000);
        const fields = [
            `> **👤 被執行者**　${user.tag} (\`${user.id}\`)`,
            `> **👮 執行者**　${executor.tag} (\`${executor.id}\`)`,
            `> **🕒 執行時間**　<t:${timestamp}:f>`,
            ...extraFields
        ];

        const content = `${fields.join('\n')}\n\n**📋 執行原因**\n${reason}`;

        const container = new ContainerBuilder()
            .setAccentColor(color)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${Emojis.Success} ${title}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(user.displayAvatarURL({ extension: 'png', size: 1024 })))
            );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }
}

module.exports = ModerationHelper;
