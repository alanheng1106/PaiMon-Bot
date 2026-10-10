import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';
import MusicPresenter from '../../core/music/MusicPresenter';

const command: Command = {
    data: new SlashCommandBuilder().setName('queue').setDescription('查看當前播放列表').setDMPermission(false),
    category: 'music',
    helpText: '🔹 `/queue` - 顯示目前播放佇列（最多顯示 10 首）與統計資訊',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        try {
            const queue = bot.music.getQueue(interaction.guild.id);
            if (!queue || !queue.songs || !queue.songs.length) {
                return await bot.sendError(interaction, '佇列為空', '當前沒有任何歌曲在播放');
            }

            // Defer early — color extraction and metadata lookup can exceed 3s
            await interaction.deferReply();

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

            await interaction.editReply(payload);
        } catch (err: any) {
            console.error('[Queue CMD]', err);
            if (typeof bot?.sendError === 'function') {
                await bot.sendError(interaction, '讀取失敗', '無法取得播放清單，請稍後再試。');
            }
        }
    }
};

export default command;
