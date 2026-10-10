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
import MusicPresenter from '../../core/music/MusicPresenter';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('隨機打亂佇列中的歌曲順序')
        .setDMPermission(false),
    category: 'music',
    cooldown: 5,
    helpText: '🔹 `/shuffle` - 將目前佇列中的歌曲（不含正在播放的）隨機打亂',
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
                `你要跟我在同一個頻道 (<#${botVoiceChannel.id}>) 才能打亂佇列!`
            );
        }

        const queue = bot.music.getQueue(interaction.guild.id);
        if (!queue || queue.isEmpty()) {
            return await bot.sendError(interaction, '佇列為空', '當前沒有任何音樂在播放!');
        }

        if (queue.size < 3) {
            return await bot.sendError(interaction, '佇列不足', '佇列中至少需要 2 首待播歌曲才能打亂!');
        }

        try {
            const shuffledCount = queue.size - 1;
            queue.shuffle();

            let previewText = '';
            if (Array.isArray(queue.songs) && queue.songs.length > 1) {
                const previewSongs = queue.songs.slice(1, 4);
                const lines = previewSongs.map((song: any, idx: number) => {
                    const rawTitle = song?.title || '未知曲目';
                    const cleanTitle = rawTitle.length > 32 ? rawTitle.slice(0, 29) + '...' : rawTitle;
                    const songLink = song?.url ? `[${cleanTitle}](${song.url})` : cleanTitle;
                    const duration =
                        song?.duration && song.duration > 0
                            ? ` \`[${typeof bot.music?.formatDuration === 'function' ? bot.music.formatDuration(song.duration) : MusicPresenter.formatDuration(song.duration)}]\``
                            : '';
                    return `\`${idx + 1}.\` **${songLink}**${duration}`;
                });
                previewText = `**📋 前排變更預覽（共 ${shuffledCount} 首）：**\n${lines.join('\n')}`;
            } else {
                previewText = `已成功隨機重新排列 **${shuffledCount}** 首待播歌曲的播放順序。`;
            }

            const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('music:queue:view')
                    .setLabel('查看新佇列')
                    .setEmoji('📋')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('music:skip')
                    .setLabel('立即播放下一首')
                    .setEmoji('⏭️')
                    .setStyle(ButtonStyle.Secondary)
            );

            const userId = interaction.user?.id || (interaction.member as any)?.id;
            const userTag = userId ? `<@${userId}>` : '未知操作者';
            const channelTag = voiceChannel?.id ? `<#${voiceChannel.id}>` : '語音頻道';

            const container = new ContainerBuilder()
                .setAccentColor(Colors.Music)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# 🔀 佇列已隨機打亂（共 ${shuffledCount} 首）`)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(previewText))
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
                )
                .addActionRowComponents(actionRow)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# 👤 操作者：${userTag} • 🔊 頻道：${channelTag}`)
                );

            await interaction.reply({ components: [container as any], flags: MessageFlags.IsComponentsV2 as any });
        } catch (err: any) {
            console.error('[Shuffle CMD]', err);
            if (typeof bot?.sendError === 'function') {
                await bot.sendError(interaction, '打亂失敗', '打亂歌曲佇列時發生內部錯誤，請稍後再試。');
            }
        }
    }
};

export default command;
