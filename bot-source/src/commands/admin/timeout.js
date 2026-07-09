const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// Map choice values (seconds) to display labels
const DURATION_MAP = {
    60: '1 分鐘',
    300: '5 分鐘',
    600: '10 分鐘',
    1800: '30 分鐘',
    3600: '1 小時',
    21600: '6 小時',
    43200: '12 小時',
    86400: '1 天',
    604800: '7 天',
    2419200: '28 天'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('禁言指定成員一段時間')
        .addUserOption((option) => option.setName('user').setDescription('要禁言的成員').setRequired(true))
        .addIntegerOption((option) =>
            option
                .setName('duration')
                .setDescription('禁言時間長度')
                .setRequired(true)
                .addChoices(
                    { name: '1 分鐘', value: 60 },
                    { name: '5 分鐘', value: 300 },
                    { name: '10 分鐘', value: 600 },
                    { name: '30 分鐘', value: 1800 },
                    { name: '1 小時', value: 3600 },
                    { name: '6 小時', value: 21600 },
                    { name: '12 小時', value: 43200 },
                    { name: '1 天', value: 86400 },
                    { name: '7 天', value: 604800 },
                    { name: '28 天', value: 2419200 }
                )
        )
        .addStringOption((option) => option.setName('reason').setDescription('禁言原因'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: 'admin',
    cooldown: 3,
    helpText: '🔹 `/timeout [成員] [時間] [原因]` - 禁言成員，支援 1 分鐘到 28 天，執行前會 DM 通知對方',
    async execute(interaction, bot) {
        const user = interaction.options.getUser('user');
        const durationSeconds = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || '未提供原因';
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) return bot.sendError(interaction, '查無成員', '在伺服器中找不到該使用者');
        if (user.id === interaction.user.id) return bot.sendError(interaction, '操作無效', '你不能禁言你自己！');
        if (user.id === bot.user.id) return bot.sendError(interaction, '操作無效', '我不能禁言我自己！');
        if (user.id === interaction.guild.ownerId)
            return bot.sendError(interaction, '權限受限', '你不能禁言伺服器擁有者！');

        if (
            interaction.member.roles.highest.position <= member.roles.highest.position &&
            interaction.guild.ownerId !== interaction.user.id
        ) {
            return bot.sendError(interaction, '權限等級不足', `你最高的身分組低於或等於 **${user.tag}**，無法執行`);
        }
        if (!member.moderatable) {
            return bot.sendError(interaction, '權限溢位', `我無法禁言此成員，請確保我的身分組高於 **${user.tag}**`);
        }

        const durationLabel = DURATION_MAP[durationSeconds] ?? `${durationSeconds} 秒`;

        // DM target before timeout (best effort)
        await user
            .send(`⏳ 你已在 **${interaction.guild.name}** 被禁言 **${durationLabel}**。\n📋 原因：\`${reason}\``)
            .catch((e) => console.warn('Ignored error:', e.message));

        try {
            await member.timeout(durationSeconds * 1000, `By ${interaction.user.tag}: ${reason}`);
            await bot.sendSuccess(
                interaction,
                '⏳ 禁言成功',
                `<:check:1524601509772529665> 已成功禁言 **${user.tag}**\n⏱️ 時長：**${durationLabel}**\n📋 原因：\`${reason}\``
            );
        } catch (err) {
            console.error('[Timeout CMD]', err);
            bot.sendError(interaction, '執行失敗', '禁言過程中發生內部錯誤，請稍後再試。');
        }
    }
};
