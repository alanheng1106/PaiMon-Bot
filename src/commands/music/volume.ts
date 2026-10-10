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

export interface VolumeCardParams {
    volume: number;
    songTitle?: string;
    voiceChannelId?: string;
    executorId?: string;
    accentColor?: number;
}

/**
 * Builds the interactive Scheme 3 Music Volume Controller Card using Discord CV2 components.
 * Formatted with true Heading 1 (#), volume meter bar, clear context hierarchy, and stepper control buttons.
 */
export function buildVolumeCard(params: VolumeCardParams) {
    const { volume, songTitle, voiceChannelId, executorId, accentColor = Colors.Music } = params;

    const clampedVolume = Math.max(1, Math.min(100, volume));
    const filled = Math.min(10, Math.max(0, Math.round(clampedVolume / 10)));
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    let detailContent = `當前音量：\`[${bar}]\` **${clampedVolume}%**`;
    if (songTitle) {
        detailContent += `\n當前曲目：**${songTitle}**`;
    }
    if (voiceChannelId) {
        detailContent += `\n語音頻道：<#${voiceChannelId}>`;
    }
    if (executorId) {
        detailContent += `\n👤 由 <@${executorId}> 調整`;
    }

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('music:volume:down:10')
            .setLabel('-10%')
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(clampedVolume <= 1),
        new ButtonBuilder()
            .setCustomId('music:volume:set:50')
            .setLabel('50% 預設')
            .setEmoji('🔄')
            .setStyle(clampedVolume === 50 ? ButtonStyle.Success : ButtonStyle.Primary)
            .setDisabled(clampedVolume === 50),
        new ButtonBuilder()
            .setCustomId('music:volume:up:10')
            .setLabel('+10%')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(clampedVolume >= 100)
    );

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        // 1. Heading 1 大標題 (嚴格遵循 Heading 1 規範，無 ### 降級)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🎛️ 音量控制台'))
        // 2. 呼吸留白（無分隔線）
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
        // 3. 核心數據與上下文展示區
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailContent))
        // 4. 正文與交互操作按鈕區實體分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 5. 步進微調交互按鈕行
        .addActionRowComponents(actionRow);

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as any
    };
}

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('調整音樂播放音量')
        .setDMPermission(false)
        .addIntegerOption((option) =>
            option.setName('level').setDescription('音量大小 (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)
        ),
    category: 'music',
    helpText: '🔹 `/volume [1-100]` - 調整音樂播放音量，設定值會在下次啟動時自動恢復',
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
                `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能調整音量!`
            );
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || queue.isEmpty()) {
            return await bot.sendError(interaction, '佇列為空', '當前沒有音樂在播放! 無法調整音量');
        }

        const volume = interaction.options.getInteger('level', true);

        try {
            bot.music.setVolume(interaction.guild.id, volume);

            // Persist volume setting for this guild
            bot.settings.set(interaction.guild.id, 'volume', volume);

            const currentSong = queue.currentSong ?? (queue.songs && queue.songs.length > 0 ? queue.songs[0] : null);
            const songTitle = currentSong?.title
                ? currentSong.title.length > 40
                    ? currentSong.title.slice(0, 37) + '...'
                    : currentSong.title
                : undefined;
            const executorId = interaction.user?.id ?? interaction.member?.user?.id ?? interaction.member?.id;

            const payload = buildVolumeCard({
                volume,
                songTitle,
                voiceChannelId: voiceChannel.id,
                executorId
            });

            await interaction.reply(payload);
        } catch (err: any) {
            console.error('[Volume CMD]', err);
            await bot.sendError(interaction, '調整失敗', '調整音量時發生內部錯誤，請稍後再試。');
        }
    }
};

export default command;
