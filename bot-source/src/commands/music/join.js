const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('讓機器人加入你所在的語音頻道'),
    category: 'music',
    helpText: '🔹 `/join` - 召喚機器人加入你目前所在的語音頻道',
    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;

        // 1. Validation
        if (!voiceChannel) {
            return bot.sendError(interaction, '語音連線遭拒', '你必須先加入一個語音頻道!');
        }

        const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has(['Connect', 'Speak'])) {
            return bot.sendError(interaction, '權限被拒絕', '我在此頻道缺少 `連線 (Connect)` 或 `說話 (Speak)` 的權限, 無法進入!');
        }

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (botVoiceChannel && botVoiceChannel.id === voiceChannel.id) {
            return bot.sendError(interaction, '已在頻道中', '我已經在該語音頻道中了!');
        }

        try {
            await bot.music.join(voiceChannel, interaction.channel);
            await bot.sendSuccess(interaction, '🔊 成功加入', `已成功加入語音頻道: <#${voiceChannel.id}>`);
        } catch (err) {
            console.error('[Join CMD]', err);
            bot.sendError(interaction, '加入失敗', '加入語音頻道時發生內部錯誤，請稍後再試。');
        }
    },
};
