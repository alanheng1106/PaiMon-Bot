const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder().setName('disconnect').setDescription('中斷語音連線並清空佇列'),
    category: 'music',
    helpText: '🔹 `/disconnect` - 讓機器人離開語音頻道並清空播放佇列',
    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;
        const botVoiceChannel = interaction.guild.members.me.voice.channel;

        // 1. Validation
        if (!botVoiceChannel) {
            return bot.sendError(interaction, '無連線', '我目前沒有在任何語音頻道中!');
        }

        if (!voiceChannel || botVoiceChannel.id !== voiceChannel.id) {
            return bot.sendError(
                interaction,
                '不在同一頻道',
                `你必須跟我（<#${botVoiceChannel.id}>）在同一個頻道才能讓我離開!`
            );
        }

        try {
            bot.music.leave(interaction.guild.id);
            await bot.sendSuccess(interaction, '🔇 斷開連線', '已成功離開語音頻道');
        } catch (err) {
            console.error('[Disconnect CMD]', err);
            bot.sendError(interaction, '斷開失敗', '發生內部錯誤，請稍後再試。');
        }
    }
};
