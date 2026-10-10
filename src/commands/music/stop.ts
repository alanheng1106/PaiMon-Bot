import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ChatInputCommandInteraction
} from 'discord.js';
import { Colors } from '../../config';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

export interface StopCardParams {
    clearedCount?: number;
    voiceChannelId?: string;
    executorId?: string;
}

export function buildStopCard(params: StopCardParams = {}) {
    const { clearedCount = 0, voiceChannelId, executorId } = params;
    const channelTag = voiceChannelId ? `<#${voiceChannelId}>` : '語音頻道';
    const clearDesc =
        clearedCount > 0
            ? `已停止播放並清空佇列中的 **${clearedCount}** 首歌曲。`
            : '已停止播放並清空所有待播歌曲。';

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('music:open_play_modal')
            .setLabel('重新點歌')
            .setEmoji('🎵')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('music:disconnect')
            .setLabel('中斷連線')
            .setEmoji('🔌')
            .setStyle(ButtonStyle.Secondary)
    );

    let descContent = `${clearDesc}\n機器人目前保留在 ${channelTag} 待命。`;
    if (executorId) {
        descContent += `\n👤 **執行者**：<@${executorId}>`;
    }

    const container = new ContainerBuilder()
        .setAccentColor(Colors.Music)
        // 1. 上面 Heading
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⏹️ 播放已終止'))
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        // 2. 中間 Description
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(descContent))
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        // 3. 下面 Button
        .addActionRowComponents(actionRow);

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as any
    };
}

const command: Command = {
    data: new SlashCommandBuilder().setName('stop').setDescription('停止播放並清空佇列').setDMPermission(false),
    category: 'music',
    helpText: '🔹 `/stop` - 停止播放並清空所有佇列中的歌曲（同時重置循環模式）',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return await bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道!');
        }

        const botVoiceChannel = interaction.guild.members.me?.voice.channel;
        if (!botVoiceChannel) {
            return await bot.sendError(interaction, '操作無效', '我目前不在任何語音頻道!');
        }

        if (botVoiceChannel.id !== voiceChannel.id) {
            return await bot.sendError(
                interaction,
                '不在同一頻道',
                `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能停止音樂!`
            );
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || queue.isEmpty()) {
            return await bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲在播放');
        }

        try {
            const clearedCount = (queue.songs?.length || 0) + (queue.currentSong ? 1 : 0);
            bot.music.stop(interaction.guild.id);

            const card = buildStopCard({
                clearedCount,
                voiceChannelId: voiceChannel.id,
                executorId: interaction.user?.id || (interaction.member as any)?.id
            });

            await interaction.reply(card);
        } catch (err: any) {
            console.error('[Stop CMD]', err);
            await bot.sendError(interaction, '停止失敗', '停止播放時發生內部錯誤，請稍後再試。');
        }
    }
};

export default command;
