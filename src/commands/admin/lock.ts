import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    ChatInputCommandInteraction,
    OverwriteType
} from 'discord.js';
import { Emojis } from '../../config';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';
import ModerationHelper from '../../utils/ModerationHelper';

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('鎖住當前頻道, 禁止一般成員發言與建立討論串')
        .addStringOption((option) => option.setName('reason').setDescription('鎖頻原因'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/lock [原因]` - 鎖住當前頻道, 禁止 @everyone 發言與建立討論串 (管理員不受影響)',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const channel = interaction.channel;

        if (channel?.isThread()) {
            return await bot.sendError(interaction, '操作無效', '無法在討論串內使用此指令，請直接在文字頻道執行.');
        }

        if (!ModerationHelper.isLockableChannel(channel)) {
            return await bot.sendError(interaction, '操作無效', '無法在此類型頻道執行鎖定操作.');
        }

        // 前置檢查機器人本身是否有「管理身分組與權限」權限 (Discord REST API 修改身分組覆寫所必需)
        const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
        if (!me) {
            return await bot.sendError(interaction, '權限不足', '無法取得機器人在本伺服器的身分資訊.');
        }

        const botPerms = channel.permissionsFor(me);
        if (!botPerms?.has(PermissionFlagsBits.ManageRoles)) {
            return await bot.sendError(
                interaction,
                '權限不足',
                '我在這個頻道缺少「管理身分組與權限」(Manage Roles) 權限, 無法修改頻道覆寫設定.'
            );
        }

        // 檢查是否已鎖定
        const everyonePerms = channel.permissionOverwrites.cache.get(interaction.guild.id);
        if (everyonePerms?.deny.has(PermissionsBitField.Flags.SendMessages)) {
            return await bot.sendError(interaction, '頻道已鎖定', '這個頻道已經鎖了!');
        }

        const reason = interaction.options.getString('reason') || '未提供原因';

        // 避免後續 Discord REST API 權限修改遠端 I/O 導致 3 秒交互超時
        await interaction.deferReply();

        try {
            await channel.permissionOverwrites.edit(
                interaction.guild.id,
                {
                    SendMessages: false,
                    SendMessagesInThreads: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false
                },
                { reason: `By ${interaction.user.tag}: ${reason}` }
            );
        } catch (err) {
            console.error('[Lock CMD]', err);
            return await bot.sendError(
                interaction,
                '執行失敗',
                '鎖定頻道時出了點問題, 請確認我有足夠的權限修改身分組覆寫.'
            );
        }

        // 檢查頻道內是否有其他非管理員身分組單獨設有 SendMessages: ALLOW，避免覆寫優先級導致鎖頻漏洞
        const extraAllowedRoles: string[] = [];
        for (const overwrite of channel.permissionOverwrites.cache.values()) {
            if (overwrite.type === OverwriteType.Role && overwrite.id !== interaction.guild.id) {
                if (overwrite.allow.has(PermissionsBitField.Flags.SendMessages)) {
                    const role = interaction.guild.roles.cache.get(overwrite.id);
                    if (role && !role.permissions.has(PermissionFlagsBits.Administrator)) {
                        extraAllowedRoles.push(role.name);
                    }
                }
            }
        }

        const payload = ModerationHelper.buildActionableLockCard({
            channel,
            executor: interaction.user,
            guild: interaction.guild,
            reason,
            extraAllowedRoles
        });

        // 獨立處理成功回覆，避免回覆拋錯時誤判定為鎖頻失敗
        try {
            if (typeof interaction.editReply === 'function') {
                await interaction.editReply(payload as any);
            } else {
                let desc = `**#${channel.name}** 已鎖定, 一般成員暫時無法發言或建立討論串.\n📋 原因: \`${reason}\``;
                if (extraAllowedRoles.length > 0) {
                    desc += `\n\n${Emojis.Warning} **提示**: 頻道內身分組 \`${extraAllowedRoles.join(', ')}\` 設有單獨發言許可，若需完全禁止發言請同步檢查該身分組覆寫設定.`;
                }
                await bot.sendSuccess(interaction, '🔒 頻道已鎖定', desc);
            }
        } catch (err) {
            console.error('[Lock CMD] Failed to deliver success response:', err);
        }
    }
};

export default command;
