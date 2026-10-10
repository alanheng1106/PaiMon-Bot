import { ButtonInteraction, MessageFlags } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import type BotClient from '../BotClient';
import MusicPresenter from '../music/MusicPresenter';

/**
 * MusicQueueButtonHandler — Handles 'music:queue:view' button interactions
 * from music console cards. Displays queue dashboard ephemerally.
 */
class MusicQueueButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'music:queue:view';
    }

    override matches(customId: string): boolean {
        return customId === 'music:queue:view' || customId === 'music:queue';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        try {
            const queue = bot.music?.getQueue?.(interaction.guild.id);
            if (!queue || (typeof queue.isEmpty === 'function' && queue.isEmpty()) || !queue.songs || !queue.songs.length) {
                return await bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲在播放!');
            }

            if (typeof interaction.deferReply === 'function') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral as any });
            }

            const isPaused = queue.player?.paused ?? false;
            const loopMode = queue.loopMode ?? (queue as any).loop ?? 'none';
            const voiceChannelId = queue.voiceChannelId ?? interaction.member?.voice?.channelId;

            const payload = await MusicPresenter.buildQueueDashboardCard({
                songs: queue.songs,
                voiceChannelId,
                isPaused,
                loopMode,
                formatDurationFn: (ms: number) =>
                    bot.music?.formatDuration ? bot.music.formatDuration(ms) : MusicPresenter.formatDuration(ms)
            });

            if (typeof interaction.editReply === 'function') {
                await interaction.editReply(payload);
            } else if (typeof interaction.reply === 'function') {
                await interaction.reply({
                    ...payload,
                    flags: ((payload.flags || 0) | MessageFlags.Ephemeral) as any
                });
            }
        } catch (err: any) {
            console.error('[MusicQueueButtonHandler]', err);
            await bot.sendError(interaction, '讀取失敗', '無法取得播放清單，請稍後再試。');
        }
    }
}

export default MusicQueueButtonHandler;
