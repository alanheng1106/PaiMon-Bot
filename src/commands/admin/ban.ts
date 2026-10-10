import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction } from 'discord.js';
import { Emojis } from '../../config';
import ModerationHelper from '../../utils/ModerationHelper';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('封鎖成員')
        .addUserOption((option) => option.setName('user').setDescription('要封鎖的成員').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('封鎖原因'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setDMPermission(false),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/ban [成員] [原因]` - 封鎖指定成員, 執行前會 DM 通知對方',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const user = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || '未提供原因';

        // 檢查機器人本身是否有「封鎖成員」權限
        const hasPermission = await ModerationHelper.checkBotPermission(
            interaction,
            bot,
            PermissionFlagsBits.BanMembers,
            '封鎖成員',
            'Ban Members'
        );
        if (!hasPermission) return;

        // 同步前置防護（防自封 / 防 Bot / 防伺服器擁有者）
        const preCheckErr = ModerationHelper.validateTarget(interaction, bot, user, null, { actionName: '執行封鎖' });
        if (preCheckErr) {
            return await bot.sendError(interaction, '權限受限', preCheckErr);
        }

        // 避免後續 members.fetch / DM 通知 / members.ban 等遠端 I/O 操作導致 3 秒交互超時
        await interaction.deferReply();

        try {
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);

            if (member) {
                const targetErr = ModerationHelper.validateTarget(interaction, bot, user, member, {
                    actionName: '執行封鎖'
                });
                if (targetErr) {
                    return await ModerationHelper.abortWithError(interaction, bot, '權限受限', targetErr);
                }

                if (!member.bannable) {
                    return await ModerationHelper.abortWithError(
                        interaction,
                        bot,
                        '權限溢位',
                        `我封鎖不了這個人! 請確認我的最高身分組高於 **${user.tag}**.`
                    );
                }

                // 執行前 DM 通知目標（若對方關閉私信，notifyTarget 內部 catch 會抑制錯誤，不阻斷封鎖流程）
                await ModerationHelper.notifyTarget(
                    user,
                    `${Emojis.Warning} 你已被 **${interaction.guild.name}** 封鎖.`,
                    reason
                );
            }

            await interaction.guild.members.ban(user, {
                reason: ModerationHelper.formatAuditReason(interaction.user, reason)
            });

            const payload = ModerationHelper.buildActionableBanCard({
                title: '成員封鎖處分',
                icon: '🔨',
                color: 0xda373c,
                user,
                executor: interaction.user,
                reason
            });

            await interaction.editReply(payload as any);
        } catch (err) {
            console.error('[Ban CMD]', err);
            await ModerationHelper.abortWithError(interaction, bot, '執行失敗', '封鎖時出了點問題, 請稍後再試.');
        }
    }
};

export default command;
