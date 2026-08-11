const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ModerationHelper = require('../../utils/ModerationHelper');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('踢出成員')
        .addUserOption((option) => option.setName('user').setDescription('要踢出的成員').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('踢出原因'))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/kick [成員] [原因]` - 將指定成員踢出伺服器, 執行前會 DM 通知對方',
    async execute(interaction, bot) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || '未提供原因';
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            return bot.sendError(interaction, '查無成員', '在伺服器中找不到該使用者');
        }

        const targetErr = ModerationHelper.validateTarget(interaction, bot, user, member, { actionName: '執行踢出' });
        if (targetErr) {
            return bot.sendError(interaction, '權限受限', targetErr);
        }

        if (!member.kickable) {
            return bot.sendError(interaction, '權限溢位', `我踢不動這個人! 請確認我的身分組有高於 **${user.tag}**`);
        }

        await ModerationHelper.notifyTarget(user, `⚠️ 你已被 **${interaction.guild.name}** 踢出.`, reason);

        try {
            await member.kick(`By ${interaction.user.tag}: ${reason}`);
            
            const payload = ModerationHelper.buildPunishmentCard({
                title: '踢出成功',
                color: Colors.Punish,
                user,
                executor: interaction.user,
                reason
            });

            await interaction.reply(payload);
        } catch (err) {
            console.error('[Kick CMD]', err);
            bot.sendError(interaction, '執行失敗', '踢出時出了點問題, 請稍後再試.');
        }
    }
};
