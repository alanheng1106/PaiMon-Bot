const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const BaseComponentHandler = require('./BaseComponentHandler');

/**
 * ValUrlButtonHandler — Handles the 'valUrlLoginBtn' button click to show the login modal.
 */
class ValUrlButtonHandler extends BaseComponentHandler {
    get customId() {
        return 'valUrlLoginBtn';
    }

    async execute(interaction, bot) {
        const modal = new ModalBuilder().setCustomId('valUrlModal').setTitle('🔗 貼上 Riot 授權網址');

        const urlInput = new TextInputBuilder()
            .setCustomId('riot_auth_url')
            .setLabel('在此貼上包含 access_token 的網址')
            .setPlaceholder('https://playvalorant.com/opt_in#access_token=...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
        await interaction.showModal(modal);
    }
}

module.exports = ValUrlButtonHandler;
