import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from 'discord.js';
import { Emojis } from '../../config';
import ModerationHelper from '../../utils/ModerationHelper';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('踢出成員')
        .addUserOption((option) => option.setName('user').setDescription('要踢出的成員').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('踢出原因'))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .setDMPermission(false),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/kick [成員] [原因]` - 將指定成員踢出伺服器, 執行前會 DM 通知對方',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || '未提供原因';

        // 檢查機器人本身是否有「踢出成員」權限
        const hasPermission = await ModerationHelper.checkBotPermission(
            interaction,
            bot,
            PermissionFlagsBits.KickMembers,
            '踢出成員',
            'Kick Members'
        );
        if (!hasPermission) return;

        // 同步前置防護（防自踢 / 防 Bot / 防伺服器擁有者）
        const preCheckErr = ModerationHelper.validateTarget(interaction, bot, user, null, { actionName: '執行踢出' });
        if (preCheckErr) {
            return await bot.sendError(interaction, '權限受限', preCheckErr);
        }

        // 避免後續 members.fetch / DM 通知 / member.kick 等遠端 I/O 操作導致 3 秒交互超時
        await interaction.deferReply();

        try {
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);

            if (!member) {
                return await ModerationHelper.abortWithError(interaction, bot, '查無成員', '在伺服器中找不到該使用者.');
            }

            const targetErr = ModerationHelper.validateTarget(interaction, bot, user, member, {
                actionName: '執行踢出'
            });
            if (targetErr) {
                return await ModerationHelper.abortWithError(interaction, bot, '權限受限', targetErr);
            }

            if (!member.kickable) {
                return await ModerationHelper.abortWithError(
                    interaction,
                    bot,
                    '權限溢位',
                    `我踢不動這個人! 請確認我的最高身分組高於 **${user.tag}**.`
                );
            }

            // 執行前 DM 通知目標（若對方關閉私信，notifyTarget 內部 catch 會抑制錯誤，不阻斷踢出流程）
            await ModerationHelper.notifyTarget(
                user,
                `${Emojis.Warning} 你已被 **${interaction.guild.name}** 踢出.`,
                reason
            );

            await member.kick(ModerationHelper.formatAuditReason(interaction.user, reason));

            const payload = ModerationHelper.buildActionableKickCard({
                title: '成員踢出處分',
                icon: '👢',
                color: 0xe67e22,
                user,
                executor: interaction.user,
                reason
            });

            await interaction.editReply(payload as any);
        } catch (err) {
            console.error('[Kick CMD]', err);
            await ModerationHelper.abortWithError(interaction, bot, '執行失敗', '踢出時出了點問題, 請稍後再試.');
        }
    }
};

export default command;
