const { SlashCommandBuilder, PermissionFlagsBits, ActivityType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setgame')
        .setDescription('設定機器人遊玩狀態')
        .addStringOption(option => option.setName('name').setDescription('狀態名稱').setRequired(true))
        .addIntegerOption(option =>
            option.setName('type')
                .setDescription('活動類型')
                .setRequired(true)
                .addChoices(
                    { name: '正在玩 (Playing)', value: ActivityType.Playing },
                    { name: '正在聽 (Listening)', value: ActivityType.Listening },
                    { name: '正在看 (Watching)', value: ActivityType.Watching },
                    { name: '競爭 (Competing)', value: ActivityType.Competing }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction, bot) {
        const name = interaction.options.getString('name', true).trim();
        const type = interaction.options.getInteger('type');

        if (!name || name.length === 0) {
            return bot.sendError(interaction, '命名無效', '活動名稱不能只有空白字元');
        }
        if (name.length > 128) {
            return bot.sendError(interaction, '命名過長', '活動名稱不能超過 128 個字元');
        }

        bot.user.setActivity(name, { type });
        await bot.sendSuccess(interaction, '🎮 狀態更新成功', `✅ 標語已更新為活動類型 **${type}**: \`${name}\``, true);
    },
};
