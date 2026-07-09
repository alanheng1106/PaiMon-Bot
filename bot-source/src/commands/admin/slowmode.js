const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('設定當前頻道的慢速模式')
        .addIntegerOption((option) =>
            option
                .setName('seconds')
                .setDescription('冷卻秒數 (0 = 關閉, 最大 21600)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(21600)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: 'admin',
    helpText: '🔹 `/slowmode [秒數]` - 設定當前頻道的慢速模式，輸入 0 可關閉。最長 6 小時（21600 秒）',
    async execute(interaction, bot) {
        const seconds = interaction.options.getInteger('seconds');

        try {
            await interaction.channel.setRateLimitPerUser(seconds, `By ${interaction.user.tag}`);

            if (seconds === 0) {
                await bot.sendSuccess(
                    interaction,
                    '🚀 慢速模式已關閉',
                    `**#${interaction.channel.name}** 的慢速模式已關閉`,
                    true
                );
            } else {
                const label =
                    seconds >= 3600
                        ? `${(seconds / 3600).toFixed(1)} 小時`
                        : seconds >= 60
                          ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
                          : `${seconds} 秒`;

                await bot.sendSuccess(
                    interaction,
                    '🐢 慢速模式已啟用',
                    `**#${interaction.channel.name}** 的慢速模式已設定為 **${label}** 每則訊息`,
                    true
                );
            }
        } catch (err) {
            console.error('[Slowmode CMD]', err);
            bot.sendError(interaction, '執行失敗', '設定慢速模式時發生內部錯誤，請確認機器人擁有 `管理頻道` 的權限。');
        }
    }
};
