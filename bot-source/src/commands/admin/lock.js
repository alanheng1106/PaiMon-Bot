const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('鎖住當前頻道，禁止一般成員發言')
        .addStringOption((option) => option.setName('reason').setDescription('鎖頻原因'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: 'admin',
    helpText: '🔹 `/lock [原因]` - 鎖住當前頻道，禁止 @everyone 發言（管理員不受影響）',
    async execute(interaction, bot) {
        const reason = interaction.options.getString('reason') || '未提供原因';
        const channel = interaction.channel;

        // Check if already locked
        const everyonePerms = channel.permissionOverwrites.cache.get(interaction.guild.id);
        if (everyonePerms?.deny.has(PermissionsBitField.Flags.SendMessages)) {
            return bot.sendError(interaction, '頻道已鎖定', '此頻道已經是鎖定狀態了！');
        }

        try {
            await channel.permissionOverwrites.edit(
                interaction.guild.id,
                {
                    SendMessages: false
                },
                { reason: `By ${interaction.user.tag}: ${reason}` }
            );

            await bot.sendSuccess(
                interaction,
                '🔒 頻道已鎖定',
                `<a:check:1524601509772529665> **#${channel.name}** 已鎖定，一般成員目前無法發言。\n📋 原因：\`${reason}\``
            );
        } catch (err) {
            console.error('[Lock CMD]', err);
            bot.sendError(interaction, '執行失敗', '鎖定頻道時發生內部錯誤，請確認機器人擁有 `管理頻道` 的權限。');
        }
    }
};
