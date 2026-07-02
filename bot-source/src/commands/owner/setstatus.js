const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setstatus')
        .setDescription('設定機器人狀態 (僅限擁有者)')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('線上/閒置/請勿打擾/隱身')
                .setRequired(true)
                .addChoices(
                    { name: '線上 (Online)', value: 'online' },
                    { name: '閒置 (Idle)', value: 'idle' },
                    { name: '請勿打擾 (Do Not Disturb)', value: 'dnd' },
                    { name: '隱身 (Invisible)', value: 'invisible' }
                )),
    async execute(interaction, bot) {
        const ownerId = process.env.OWNER_ID;
        if (!ownerId || interaction.user.id !== ownerId) {
            return bot.sendError(interaction, '權限不足', '此指令僅限機器人擁有者使用。');
        }


        const option = interaction.options.getString('status');
        const validStatuses = ['online', 'idle', 'dnd', 'invisible'];
        if (!validStatuses.includes(option)) {
            return bot.sendError(interaction, '狀態無效', `發送了未知的狀態碼：\`${option}\``);
        }

        bot.user.setStatus(option);
        await bot.sendSuccess(interaction, '📡 狀態切換成功', `✅ 核心狀態已切換為：**${option}**`, true);
    },
};
