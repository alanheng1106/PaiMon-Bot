const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('警告指定成員並記錄')
        .addUserOption((option) => option.setName('user').setDescription('要警告的成員').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('警告原因').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: 'admin',
    cooldown: 3,
    helpText: '🔹 `/warn [成員] [原因]` - 警告成員並記錄，累積次數可用 `/warnings` 查詢',
    async execute(interaction, bot) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) return bot.sendError(interaction, '查無成員', '在伺服器中找不到該使用者');
        if (user.id === interaction.user.id) return bot.sendError(interaction, '操作無效', '你不能警告你自己！');
        if (user.id === bot.user.id) return bot.sendError(interaction, '操作無效', '你不能警告我！');

        if (
            interaction.member.roles.highest.position <= member.roles.highest.position &&
            interaction.guild.ownerId !== interaction.user.id
        ) {
            return bot.sendError(interaction, '權限等級不足', `你最高的身分組低於或等於 **${user.tag}**，無法執行`);
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
        await user
            .send(
                `⚠️ 你在 **${interaction.guild.name}** 收到了一個警告（共 ${warnCount} 次）。\n📋 原因：\`${reason}\``
            )
            .catch((e) => console.warn('Ignored error:', e.message));

        await bot.sendSuccess(
            interaction,
            '⚠️ 警告已記錄',
            `<a:check:1524601509772529665> 已警告 **${user.tag}**\n📋 原因：\`${reason}\`\n📊 該成員目前累積 **${warnCount}** 次警告`
        );
    }
};
