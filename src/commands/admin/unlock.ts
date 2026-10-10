import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    ChatInputCommandInteraction,
    GuildTextBasedChannel,
    PermissionOverwriteManager
} from 'discord.js';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';
import ModerationHelper from '../../utils/ModerationHelper';

type LockableGuildChannel = GuildTextBasedChannel & {
    permissionOverwrites: PermissionOverwriteManager;
    name: string;
};

function isLockableChannel(channel: unknown): channel is LockableGuildChannel {
    if (!channel || typeof channel !== 'object') return false;
    const c = channel as {
        isThread?: () => boolean;
        permissionOverwrites?: unknown;
        permissionsFor?: unknown;
        name?: unknown;
    };
    try {
        if (typeof c.isThread === 'function' && c.isThread()) {
            return false;
        }
    } catch {
        return false;
    }
    return (
        typeof c.permissionOverwrites === 'object' &&
        c.permissionOverwrites !== null &&
        typeof c.permissionsFor === 'function' &&
        typeof c.name === 'string'
    );
}

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('解鎖當前頻道，恢復一般成員發言與建立討論串')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false),
    category: 'admin',
    cooldown: 5,
    helpText: '🔹 `/unlock` - 解鎖當前頻道，讓 @everyone 恢復正常發言與討論串權限',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const channel = interaction.channel;

        if (channel?.isThread()) {
            return await bot.sendError(interaction, '操作無效', '無法在討論串內使用此指令，請直接在文字頻道執行.');
        }

        if (!isLockableChannel(channel)) {
            return await bot.sendError(interaction, '操作無效', '無法在此頻道執行此操作');
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

        // 檢查是否確實已鎖定
        const everyonePerms = channel.permissionOverwrites.cache.get(interaction.guild.id);
        if (!everyonePerms?.deny.has(PermissionsBitField.Flags.SendMessages)) {
            return await bot.sendError(interaction, '頻道未鎖定', '這個頻道目前沒有被鎖定!');
        }

        // 避免遠端 I/O 導致 3 秒交互超時
        await interaction.deferReply();

        try {
            await channel.permissionOverwrites.edit(
                interaction.guild.id,
                {
                    SendMessages: null, // null = inherit from role/default
                    SendMessagesInThreads: null,
                    CreatePublicThreads: null,
                    CreatePrivateThreads: null
                },
                { reason: `Unlocked by ${interaction.user.tag}` }
            );
        } catch (err) {
            console.error('[Unlock CMD]', err);
            return await bot.sendError(
                interaction,
                '執行失敗',
                '解鎖頻道時出了點問題, 請確認我有足夠的權限修改身分組覆寫.'
            );
        }

        const payload = ModerationHelper.buildActionableUnlockCard({
            channel,
            executor: interaction.user,
            guild: interaction.guild
        });

        try {
            if (typeof interaction.editReply === 'function') {
                await interaction.editReply(payload as any);
            } else {
                await bot.sendSuccess(
                    interaction,
                    '🔓 頻道已解鎖',
                    `**#${channel.name}** 已解鎖, 成員可以正常發言與建立討論串了.`
                );
            }
        } catch (err) {
            console.error('[Unlock CMD] Failed to deliver success response:', err);
        }
    }
};

export default command;
