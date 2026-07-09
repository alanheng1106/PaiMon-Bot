const { SlashCommandBuilder, ActivityType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setgame')
        .setDescription('設定機器人遊玩狀態 (僅限擁有者)')
        .addStringOption((option) => option.setName('name').setDescription('狀態名稱').setRequired(true))
        .addIntegerOption((option) =>
            option
                .setName('type')
                .setDescription('活動類型')
                .setRequired(true)
                .addChoices(
                    { name: '正在玩 (Playing)', value: ActivityType.Playing },
                    { name: '正在聽 (Listening)', value: ActivityType.Listening },
                    { name: '正在看 (Watching)', value: ActivityType.Watching },
                    { name: '競爭 (Competing)', value: ActivityType.Competing }
                )
        ),
    category: 'owner',
    helpText: '🔹 `/setgame [狀態名稱] [類型]` - 設定機器人的活動狀態（僅限擁有者）',
    async execute(interaction, bot) {
        const ownerId = process.env.OWNER_ID;
        if (!ownerId || interaction.user.id !== ownerId) {
            return bot.sendError(interaction, '權限不足', '此指令僅限機器人擁有者使用。');
        }

        const name = interaction.options.getString('name', true).trim();
        const type = interaction.options.getInteger('type');

        if (!name || name.length === 0) {
            return bot.sendError(interaction, '命名無效', '活動名稱不能只有空白字元');
        }
        if (name.length > 128) {
            return bot.sendError(interaction, '命名過長', '活動名稱不能超過 128 個字元');
        }

        bot.user.setActivity(name, { type });
        await bot.sendSuccess(interaction, '🎮 狀態更新成功', `<:check:1524601509772529665> 標語已更新為活動類型 **${type}**: \`${name}\``, true);
    }
};
