const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder, MessageFlags } = require('discord.js');
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

        // 1. Basic Identity Validation
        if (user.id === interaction.user.id) {
            return bot.sendError(interaction, '操作無效', '你不能踢出你自己!');
        }
        if (user.id === bot.user.id) {
            return bot.sendError(interaction, '操作無效', '我沒辦法踢出我自己啦! 要趕我走的話請手動操作');
        }
        if (user.id === interaction.guild.ownerId) {
            return bot.sendError(interaction, '權限受限', '你不能踢出伺服器擁有者!');
        }

        // 2. Role hierarchy check (Caller vs Target)
        if (
            interaction.member.roles.highest.position <= member.roles.highest.position &&
            interaction.guild.ownerId !== interaction.user.id
        ) {
            return bot.sendError(
                interaction,
                '權限等級不足',
                `你的最高身分組 **[${interaction.member.roles.highest.name}]** 不高於 **${user.tag}**, 無法執行`
            );
        }

        // 3. Bot hierarchy check
        if (!member.kickable) {
            return bot.sendError(
                interaction,
                '權限溢位',
                `我踢不動這個人! 請確認我的身分組有高於 **${user.tag}**`
            );
        }

        // 4. DM the target before kicking (best effort)
        await user
            .send(`⚠️ 你已被 **${interaction.guild.name}** 踢出.\n📋 原因: \`${reason}\``)
            .catch((e) => console.warn('Ignored error:', e.message));

        try {
            await member.kick(`By ${interaction.user.tag}: ${reason}`);
            
            const timestamp = Math.floor(Date.now() / 1000);
            const content = `> **👤 被執行者**　${user.tag} (\`${user.id}\`)
> **👮 執行者**　${interaction.user.tag} (\`${interaction.user.id}\`)
> **🕒 執行時間**　<t:${timestamp}:f>

**📋 執行原因**
${reason}`;
            
            const container = new ContainerBuilder()
                .setAccentColor(Colors.Punish)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <a:check:1524601509772529665> 踢出成功`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(user.displayAvatarURL({ extension: 'png', size: 1024 })))
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('[Kick CMD]', err);
            bot.sendError(interaction, '執行失敗', '踢出時出了點問題, 請稍後再試.');
        }
    }
};
