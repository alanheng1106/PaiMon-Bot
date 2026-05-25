const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('顯示所有可用指令'),
    async execute(interaction, bot) {
        const embed = new EmbedBuilder()
            .setColor(Colors.Primary)
            .setTitle('📖 指令手冊')
            .setDescription('以下是我所搭載的所有可用功能：\n')
            .addFields(
                { name: '🧠 人工智慧 (AI)', value: '`/ask` - 深度對話互動\n`/imagine` - AI 繪圖生成' },
                { name: '🎶 音樂模組 (Music)', value: '`/play` - 搜尋播放 | `/join` - 加入頻道\n`/nowplaying` - 當前歌曲 | `/queue` - 播放清單\n`/skip` - 跳過歌曲 | `/stop` - 停播清空\n`/volume` - 音量調整 | `/disconnect` - 離開頻道\n`/pause` - 暫停播放 | `/resume` - 繼續播放' },
                { name: '⚔️ 管理工具 (Admin)', value: '`/ban` - 封鎖成員\n`/kick` - 踢出成員\n`/rename` - 變更暱稱\n`/setgame` - 設定活動\n`/setstatus` - 切換狀態\n`/shutdown` - 安全關機' },
                { name: '⚙️ 核心系統 (General)', value: '`/ping` - 查看延遲\n`/about` - 系統狀態\n`/help` - 指令手冊' }
            )
            .setFooter({ text: '由 HaeImDuck 製作' })

            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
