const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder, MessageFlags } = require('discord.js');
const { Colors } = require('../../config');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('封鎖並踢出伺服器')
        .addUserOption((option) => option.setName('user').setDescription('要封鎖的成員').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('封鎖原因'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/ban [成員] [原因]` - 封鎖並踢出指定成員，執行前會 DM 通知對方',
    async execute(interaction, bot) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || '未提供原因';
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        // 1. Basic Identity Validation
        if (user.id === interaction.user.id) {
            return bot.sendError(interaction, '操作無效', '你不能封鎖你自己! 這是一個預防性安全機制');
        }
        if (user.id === bot.user.id) {
            return bot.sendError(interaction, '操作無效', '我不能封鎖我自己! 如果你想讓我離開, 請直接將我踢出');
        }
        if (user.id === interaction.guild.ownerId) {
            return bot.sendError(interaction, '權限受限', '你不能封鎖伺服器的擁有者! 這是 Discord 的核心安全性限制');
        }

        // 2. Member/Hierarchy Validation
        if (member) {
            // Role hierarchy check (Caller vs Target)
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

            // Bot hierarchy check
            if (!member.bannable) {
                return bot.sendError(
                    interaction,
                    '權限溢位',
                    `我無法封鎖此成員! 請確保我的身分組在伺服器設定中高於 **${user.tag}**`
                );
            }
        }

        // 3. DM the target before banning (best effort)
        if (member) {
            await user
                .send(`⚠️ 你已被 **${interaction.guild.name}** 封鎖。\n📋 原因：\`${reason}\``)
                .catch((e) => console.warn('Ignored error:', e.message));
        }

        try {
            await interaction.guild.members.ban(user, { reason: `By ${interaction.user.tag}: ${reason}` });
            
            const timestamp = Math.floor(Date.now() / 1000);
            const content = `**👤 被執行者**\n${user.tag} (\`${user.id}\`)\n\n**👮 執行者**\n${interaction.user.tag} (\`${interaction.user.id}\`)\n\n**🕒 執行時間**\n<t:${timestamp}:f>\n\n**📋 執行原因**\n${reason}`;
            
            const container = new ContainerBuilder()
                .setAccentColor(Colors.Success)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <a:check:1524601509772529665> 封鎖成功`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(user.displayAvatarURL({ extension: 'png', size: 1024 })))
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('[Ban CMD]', err);
            bot.sendError(interaction, '執行失敗', '封鎖過程中發生內部錯誤，請稍後再試。');
        }
    }
};
