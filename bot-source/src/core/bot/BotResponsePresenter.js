const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const { Colors, Emojis } = require('../../config');

/**
 * BotResponsePresenter — Encapsulates UI response component formatting and delivery.
 * Refactored for Presentation Layer separation and Single Responsibility Principle (SRP).
 */
class BotResponsePresenter {
    /**
     * Send Error response container to interaction.
     */
    static async sendError(interaction, title, description) {
        const cleanTitle = title.replace(/^\s*(?:<a?:\w+:\d+>|\p{Extended_Pictographic})*\s*/gu, '').trim();
        const container = new ContainerBuilder()
            .setAccentColor(Colors.Error)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${Emojis.Error} ${cleanTitle}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${description}`));

        const payload = { components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 };
        try {
            if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
            else await interaction.reply(payload);
        } catch (err) {
            console.warn('[BotResponsePresenter] Failed to deliver error response:', err.message);
        }
    }

    /**
     * Send Success response container to interaction.
     */
    static async sendSuccess(interaction, title, description, ephemeral = false) {
        const cleanTitle = title.replace(/^\s*(?:<a?:\w+:\d+>|\p{Extended_Pictographic})*\s*/gu, '').trim();
        const container = new ContainerBuilder()
            .setAccentColor(Colors.Success)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${Emojis.Success} ${cleanTitle}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${description}`));

        const flags = (ephemeral ? MessageFlags.Ephemeral : 0) | MessageFlags.IsComponentsV2;
        const payload = { components: [container], flags };
        try {
            if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
            else await interaction.reply(payload);
        } catch (err) {
            console.warn('[BotResponsePresenter] Failed to deliver success response:', err.message);
        }
    }
}

module.exports = BotResponsePresenter;
