const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
    MessageFlags
} = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('logout').setDescription('登出你的 Riot 帳號'),
    category: 'valorant',
    helpText: '🔹 `/logout` - 登出已登入的 Riot 帳號（支援單獨或全部登出）',

    async execute(interaction, bot) {
        const userId = interaction.user.id;
        const sessions = bot.valorant.getSessions(userId);

        if (!sessions) {
            const text = new TextDisplayBuilder().setContent('### ℹ️ 無需登出\n你目前沒有任何已登入的 Riot 帳號。');
            const container = new ContainerBuilder().setAccentColor(Colors.Warning).addTextDisplayComponents(text);
            return interaction.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
        }

        const riotIds = Object.keys(sessions);

        if (riotIds.length === 1) {
            // Single account — logout directly
            bot.valorant.removeSession(userId, riotIds[0]);
            const text = new TextDisplayBuilder().setContent(`### 👋 已登出\n已成功登出 **${riotIds[0]}**`);
            const container = new ContainerBuilder().setAccentColor(Colors.Success).addTextDisplayComponents(text);
            return interaction.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
        }

        // Multiple accounts — show select menu
        const options = riotIds.map((id) => ({
            label: id,
            value: id,
            emoji: '🎮'
        }));

        // Add "logout all" option
        options.push({
            label: '🗑️ 全部登出',
            value: '__all__',
            emoji: '🗑️',
            description: '登出所有已登入的帳號'
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('val_logout_select')
            .setPlaceholder('選擇要登出的帳號...')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        const text = new TextDisplayBuilder().setContent(`### 👋 選擇要登出的帳號\n你目前有 **${riotIds.length}** 個已登入的帳號：\n${riotIds.map((id) => `• ${id}`).join('\n')}`);
        const container = new ContainerBuilder().setAccentColor(Colors.Valorant).addTextDisplayComponents(text);

        const response = await interaction.reply({
            components: [container, row],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            fetchReply: true
        });

        try {
            const selection = await response.awaitMessageComponent({
                componentType: ComponentType.StringSelect,
                filter: (i) => i.user.id === userId,
                time: 30_000
            });

            const selected = selection.values[0];

            if (selected === '__all__') {
                bot.valorant.removeAllSessions(userId);
                const text = new TextDisplayBuilder().setContent(`### 🗑️ 已全部登出\n已成功登出所有 **${riotIds.length}** 個帳號。`);
                const container = new ContainerBuilder().setAccentColor(Colors.Success).addTextDisplayComponents(text);
                await selection.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } else {
                bot.valorant.removeSession(userId, selected);
                const text = new TextDisplayBuilder().setContent(`### 👋 已登出\n已成功登出 **${selected}**`);
                const container = new ContainerBuilder().setAccentColor(Colors.Success).addTextDisplayComponents(text);
                await selection.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
        } catch {
            const text = new TextDisplayBuilder().setContent('### ⏳ 操作逾時\n未在時間內選擇，請重新使用 `/logout`。');
            const container = new ContainerBuilder().setAccentColor(Colors.Warning).addTextDisplayComponents(text);
            await interaction
                .editReply({ components: [container], flags: MessageFlags.IsComponentsV2 })
                .catch((e) => console.warn('Ignored error:', e.message));
        }
    }
};
