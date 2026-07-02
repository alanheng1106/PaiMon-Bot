const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('查看指定成員的警告記錄')
        .addUserOption(option =>
            option.setName('user').setDescription('要查詢的成員').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: 'admin',
    helpText: '🔹 `/warnings [成員]` - 查看指定成員的所有警告記錄（原因、時間、發出者）',
    async execute(interaction, bot) {
        const user = interaction.options.getUser('user');

        const guildWarnings = bot.settings.get(interaction.guild.id, 'warnings') ?? {};
        const userWarnings = guildWarnings[user.id] ?? [];

        if (userWarnings.length === 0) {
            return bot.sendSuccess(interaction, '📋 警告記錄',
                `**${user.tag}** 目前沒有任何警告記錄。`, true);
        }

        // Show last 10 warnings
        const displayWarnings = userWarnings.slice(-10);
        const warnLines = displayWarnings.map((w, i) => {
            const index = userWarnings.length - displayWarnings.length + i + 1;
            const date = new Date(w.timestamp).toLocaleDateString('zh-TW');
            return `**#${index}** \`${date}\` — ${w.reason}\n　　↳ 由 **${w.by}** 發出`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor(Colors.Error)
            .setTitle(`⚠️ 警告記錄 — ${user.tag}`)
            .setThumbnail(user.displayAvatarURL())
            .setDescription(warnLines)
            .setFooter({ text: `共 ${userWarnings.length} 次警告${userWarnings.length > 10 ? '（僅顯示最近 10 次）' : ''}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
