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
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';
import type { LoopMode } from '../../core/music/GuildQueue';

export interface LoopCardParams {
    currentMode: LoopMode;
    songTitle?: string;
    queueLength?: number;
    voiceChannelId?: string;
    executorId?: string;
}

/**
 * Builds the interactive Scheme 3 Music Loop Controller Card using Discord CV2 components.
 * Formatted with Heading 1, status-aware accent colors, clear metadata hierarchy, and mode buttons.
 */
export function buildLoopCard(params: LoopCardParams) {
    const { currentMode, songTitle, queueLength, voiceChannelId, executorId } = params;

    // 1. 狀態感知配色：關閉使用沉穩中性灰，單曲循環使用琥珀金，佇列循環使用活力綠
    const modeColors: Record<LoopMode, number> = {
        none: 0x4e5058, // Sleek Muted Grey (關閉)
        track: 0xfee75c, // Amber Yellow (單曲循環)
        queue: 0x57f287 // Vibrant Green (佇列循環)
    };

    const modeDetails: Record<LoopMode, { label: string; desc: string }> = {
        none: {
            label: '關閉',
            desc: '曲目將按序播放，播畢後自動停止'
        },
        track: {
            label: '🔂 單曲循環',
            desc: '當前曲目播畢後將自動重播'
        },
        queue: {
            label: '🔁 佇列循環',
            desc: '整張播放清單將無限順序輪播'
        }
    };

    const currentDetail = modeDetails[currentMode] || modeDetails.none;

    let detailContent = `當前狀態：**${currentDetail.label}** (${currentDetail.desc})`;
    if (songTitle) {
        detailContent += `\n當前曲目：**${songTitle}**`;
    }
    if (queueLength !== undefined) {
        detailContent += `\n佇列數量：**${queueLength}** 首`;
    }
    if (voiceChannelId) {
        detailContent += `\n語音頻道：<#${voiceChannelId}>`;
    }

    // 2. 交互控制按鈕組（當前模式高亮且禁用，避免重複點擊）
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('music:loop:none')
            .setLabel('關閉循環')
            .setEmoji('⏹️')
            .setStyle(currentMode === 'none' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(currentMode === 'none'),
        new ButtonBuilder()
            .setCustomId('music:loop:track')
            .setLabel('單曲循環')
            .setEmoji('🔂')
            .setStyle(currentMode === 'track' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(currentMode === 'track'),
        new ButtonBuilder()
            .setCustomId('music:loop:queue')
            .setLabel('佇列循環')
            .setEmoji('🔁')
            .setStyle(currentMode === 'queue' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(currentMode === 'queue')
    );

    const executorSubtext = executorId ? ` • 由 <@${executorId}> 操作` : '';

    const container = new ContainerBuilder()
        .setAccentColor(modeColors[currentMode] ?? 0x5865f2)
        // 1. Heading 1 大標題 (嚴格遵循 Heading 1 規範)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🎛️ 音樂循環控制台'))
        // 2. 緊湊分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 3. 狀態與上下文展示區
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailContent))
        // 4. 正文與操作按鈕區分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 5. 獨立交互按鈕行
        .addActionRowComponents(actionRow)
        // 6. 底部次要提示與操作說明 (-# subtext)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 💡 點擊上方按鈕可即時切換播放模式${executorSubtext}`)
        );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as any
    };
}

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('切換循環模式 (關閉 → 單曲循環 → 佇列循環)')
        .setDMPermission(false),
    category: 'music',
    helpText: '🔹 `/loop` - 打開循環控制面板或切換播放模式：關閉 → 🔂 單曲循環 → 🔁 佇列循環 → 關閉',
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
            return await bot.sendError(interaction, '不在同一頻道', `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>)!`);
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || queue.isEmpty()) {
            return await bot.sendError(interaction, '佇列為空', '當前沒有音樂在播放!');
        }

        try {
            // Cycle through loop modes: none → track → queue → none
            const modes: LoopMode[] = ['none', 'track', 'queue'];
            const currentIndex = modes.indexOf(queue.loopMode ?? 'none');
            const nextMode = modes[(currentIndex + 1) % modes.length];
            queue.setLoopMode(nextMode);

            const currentSong = queue.songs?.[0];
            const songTitle = currentSong?.title
                ? currentSong.title.length > 40
                    ? currentSong.title.slice(0, 37) + '...'
                    : currentSong.title
                : undefined;

            const executorId = interaction.user?.id ?? interaction.member?.user?.id ?? interaction.member?.id;

            const payload = buildLoopCard({
                currentMode: nextMode,
                songTitle,
                queueLength: queue.songs?.length,
                voiceChannelId: queue.voiceChannelId ?? botVoiceChannel.id,
                executorId
            });

            await interaction.reply(payload);
        } catch (err: any) {
            console.error('[Loop CMD]', err);
            await bot.sendError(interaction, '切換失敗', '切換循環模式時發生內部錯誤，請稍後再試。');
        }
    }
};

export default command;
