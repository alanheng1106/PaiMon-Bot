const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rename')
        .setDescription('變更成員暱稱')
        .addUserOption((option) => option.setName('user').setDescription('要變更暱稱的成員').setRequired(true))
        .addStringOption((option) => option.setName('nickname').setDescription('新暱稱').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
    category: 'admin',
    helpText: '🔹 `/rename [成員] [新暱稱]` - 變更指定成員的伺服器暱稱',
    async execute(interaction, bot) {
        const user = interaction.options.getUser('user');
        const nickname = interaction.options.getString('nickname');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            return bot.sendError(interaction, '查無成員', '在伺服器中找不到該使用者');
        }

        // 1. Basic Identity Validation
        if (user.id === interaction.user.id) {
            return bot.sendError(
                interaction,
                '操作無效',
                '你不能使用機器人指令來變更你自己的暱稱，請直接在 Discord 中修改'
            );
        }
        if (user.id === bot.user.id) {
            return bot.sendError(
                interaction,
                '操作無效',
                '我不建議變更我自己的鑑定暱稱! 如果需要，請在伺服器設定中手動修改'
            );
        }
        if (user.id === interaction.guild.ownerId) {
            return bot.sendError(interaction, '權限受限', '你不能變更伺服器擁有者的暱稱! 這是伺服器最高權限的安全保護');
        }

        // 2. Data Integrity Validation
        if (nickname.length > 32) {
            return bot.sendError(interaction, '格式錯誤', '暱稱長度不能超過 32 個字元。');
        }
        if (nickname === member.displayName) {
            return bot.sendError(interaction, '無變更', '新暱稱與目前使用的暱稱完全相同');
        }

        // 3. Role hierarchy check (Caller vs Target)
        if (
            interaction.member.roles.highest.position <= member.roles.highest.position &&
            interaction.guild.ownerId !== interaction.user.id
        ) {
            return bot.sendError(
                interaction,
                '權限等級不足',
                `你最高的身分組 **[${interaction.member.roles.highest.name}]** 低於或等於 **${user.tag}**, 無法執行`
            );
        }

        // 4. Bot hierarchy check
        if (!member.manageable) {
            return bot.sendError(
                interaction,
                '權限溢位',
                `我無法管理此成員的暱稱! 請確保我的身分組在伺服器設定中高於 **${user.tag}**`
            );
        }

        try {
            const oldNickname = member.displayName;
            await member.setNickname(nickname);
            await bot.sendSuccess(
                interaction,
                '📝 暱稱變更成功',
                `已將 **${user.tag}** 的暱稱從 \`${oldNickname}\` 更改為 \`${nickname}\``
            );
        } catch (err) {
            console.error('[Rename CMD]', err);
            bot.sendError(interaction, '執行失敗', '更改暱稱時發生內部錯誤，請稍後再試。');
        }
    }
};
