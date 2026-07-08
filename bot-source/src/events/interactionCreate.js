const {
    Events,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');
const { Colors } = require('../config');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, bot) {
        // ─── Slash Commands ──────────────────────────────────
        if (interaction.isChatInputCommand()) {
            const command = bot.commands.get(interaction.commandName);
            if (!command) return;

            // Cooldown check
            if (command.cooldown) {
                const remaining = bot.cooldowns.check(interaction.commandName, interaction.user.id, command.cooldown);
                if (remaining) {
                    return interaction.reply({
                        content: `⏳ 冷卻中！請等待 **${remaining}** 秒後再試。`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            try {
                await command.execute(interaction, bot);
            } catch (error) {
                console.error(`[Exec: ${interaction.commandName}] Failed:`, error.message);
                await bot.sendError(interaction, '系統核心攔截到預期外的錯誤', '指令執行時發生內部錯誤，請稍後再試。');
            }
            return;
        }

        // ─── Button Clicks ───────────────────────────────────
        if (interaction.isButton()) {
            if (interaction.customId === 'valUrlLoginBtn') {
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
            return;
        }

        // ─── Modal Submissions ───────────────────────────────
        if (interaction.isModalSubmit()) {
            try {
                if (interaction.customId === 'valUrlModal') {
                    await _handleValUrlLogin(interaction, bot);
                }
            } catch (error) {
                console.error('[Modal] Failed:', error.message);
                const text = new TextDisplayBuilder().setContent('### ❌ 處理失敗\n處理登入時發生錯誤，請稍後再試。');
                const container = new ContainerBuilder().setAccentColor(Colors.Error).addTextDisplayComponents(text);
                const payload = { components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 };
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp(payload).catch((e) => console.warn('Ignored error:', e.message));
                } else {
                    await interaction.reply(payload).catch((e) => console.warn('Ignored error:', e.message));
                }
            }
        }
    }
};

/**
 * Handle the URL login modal submission.
 */
async function _handleValUrlLogin(interaction, bot) {
    const authUrl = interaction.fields.getTextInputValue('riot_auth_url');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await bot.valorant.loginWithUrl(interaction.user.id, authUrl);

    if (result.error) {
        const text = new TextDisplayBuilder().setContent(`### ❌ 登入失敗\n${result.error}`);
        const container = new ContainerBuilder().setAccentColor(Colors.Error).addTextDisplayComponents(text);
        return interaction.followUp({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    }

    // Success
    const content = `### ✅ 登入成功！\n**Riot ID：** ${result.riotId}\n**伺服器：** ${result.shard.toUpperCase()}\n\n現在可以使用 \`/store\` 查看你的每日商店了！\n\n💡 提示：此授權的有效期約為 1 小時，過期後需重新授權。`;
    const text = new TextDisplayBuilder().setContent(content);
    const container = new ContainerBuilder().setAccentColor(Colors.Success).addTextDisplayComponents(text);

    return interaction.followUp({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
}
