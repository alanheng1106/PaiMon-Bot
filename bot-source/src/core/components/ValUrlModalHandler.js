const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const BaseComponentHandler = require('./BaseComponentHandler');
const { Colors, Emojis } = require('../../config');

/**
 * ValUrlModalHandler — Handles the 'valUrlModal' submission for Riot login.
 */
class ValUrlModalHandler extends BaseComponentHandler {
    get customId() {
        return 'valUrlModal';
    }

    async execute(interaction, bot) {
        const authUrl = interaction.fields.getTextInputValue('riot_auth_url');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const result = await bot.valorant.loginWithUrl(interaction.user.id, authUrl);

        if (result.error) {
            const container = new ContainerBuilder()
                .setAccentColor(Colors.Error)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${Emojis.Error} 登入失敗`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${result.error}`));
            return interaction.followUp({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
        }

        // Success
        const content = `**Riot ID:** ${result.riotId}\n**伺服器:** ${result.shard.toUpperCase()}\n\n現在可以用 \`/store\` 查看你的每日商店了!\n\n💡 提示: 授權大約 1 小時後過期, 届時需要重新登入.`;
        const container = new ContainerBuilder()
            .setAccentColor(Colors.Success)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${Emojis.Success} 登入成功!`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        return interaction.followUp({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    }
}

module.exports = ValUrlModalHandler;
