const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder().setName('skip').setDescription('跳過當前歌曲'),
    category: 'music',
    cooldown: 2,
    helpText: '🔹 `/skip` - 跳過目前正在播放的歌曲',
    async execute(interaction, bot) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) return bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道!');

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        if (!botVoiceChannel) return bot.sendError(interaction, '操作無效', '我目前不在任何語音頻道!');

        if (botVoiceChannel.id !== voiceChannel.id) {
            return bot.sendError(
                interaction,
                '不在同一頻道',
                `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能跳過歌曲!`
            );
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || !queue.songs.length) return bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲可以跳過');

        bot.music.skip(interaction.guild.id);
        await bot.sendSuccess(interaction, '⏭️ 跳過歌曲', '已成功為你跳過當前正在播放的歌曲');
    }
};
