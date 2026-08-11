const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ModerationHelper = require('../../utils/ModerationHelper');
const { Colors } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('封鎖成員')
        .addUserOption((option) => option.setName('user').setDescription('要封鎖的成員').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('封鎖原因'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/ban [成員] [原因]` - 封鎖指定成員, 執行前會 DM 通知對方',
    async execute(interaction, bot) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || '未提供原因';
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        const targetErr = ModerationHelper.validateTarget(interaction, bot, user, member, { actionName: '執行封鎖' });
        if (targetErr) {
            return bot.sendError(interaction, '權限受限', targetErr);
        }

        if (member && !member.bannable) {
            return bot.sendError(interaction, '權限溢位', `我封鎖不了這個人! 請確認我的身分組有高於 **${user.tag}**`);
        }

        if (member) {
            await ModerationHelper.notifyTarget(user, `⚠️ 你已被 **${interaction.guild.name}** 封鎖.`, reason);
        }

        try {
            await interaction.guild.members.ban(user, { reason: `By ${interaction.user.tag}: ${reason}` });
            
            const payload = ModerationHelper.buildPunishmentCard({
                title: '封鎖成功',
                color: Colors.Punish,
                user,
                executor: interaction.user,
                reason
            });

            await interaction.reply(payload);
        } catch (err) {
            console.error('[Ban CMD]', err);
            bot.sendError(interaction, '執行失敗', '封鎖時出了點問題, 請稍後再試.');
        }
    }
};
