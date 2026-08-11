const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ModerationHelper = require('../../utils/ModerationHelper');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('警告指定成員並記錄')
        .addUserOption((option) => option.setName('user').setDescription('要警告的成員').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('警告原因').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: 'admin',
    cooldown: 3,
    helpText: '🔹 `/warn [成員] [原因]` - 警告成員並記錄, 累積次數可用 `/warnings` 查詢',
    async execute(interaction, bot) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) return bot.sendError(interaction, '查無成員', '在伺服器中找不到該使用者');

        const targetErr = ModerationHelper.validateTarget(interaction, bot, user, member, { actionName: '警告' });
        if (targetErr) {
            return bot.sendError(interaction, '權限受限', targetErr);
        }

        // Load current warnings from guild settings
        const guildWarnings = bot.settings.get(interaction.guild.id, 'warnings') ?? {};
        const userWarnings = guildWarnings[user.id] ?? [];

        const newEntry = {
            reason,
            timestamp: new Date().toISOString(),
            by: interaction.user.tag
        };
        userWarnings.push(newEntry);
        guildWarnings[user.id] = userWarnings;
        bot.settings.set(interaction.guild.id, 'warnings', guildWarnings);

        const warnCount = userWarnings.length;

        // DM target (best effort)
        await ModerationHelper.notifyTarget(
            user,
            `⚠️ 你在 **${interaction.guild.name}** 收到一次警告 (共 ${warnCount} 次).`,
            reason
        );

        const payload = ModerationHelper.buildPunishmentCard({
            title: '警告已記錄',
            color: Colors.Warning,
            user,
            executor: interaction.user,
            reason,
            extraFields: [`> **📊 累積警告**　共 ${warnCount} 次`]
        });

        await interaction.reply(payload);
    }
};
