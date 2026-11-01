import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import MusicPresenter, { type NowPlayingCardParams } from '../../core/music/MusicPresenter';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

export { type NowPlayingCardParams };
export const buildNowPlayingCard = (params: NowPlayingCardParams) => MusicPresenter.buildNowPlayingCard(params);
export const NOWPLAYING_REFRESH_INTERVAL_MS = 5000;

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('顯示當前正在播放的歌曲')
        .setDMPermission(false),
    category: 'music',
    helpText: '🔹 `/nowplaying` - 查看目前正在播放的歌曲資訊與播放進度',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        try {
            const queue = bot.music.getQueue(interaction.guild.id);
            if (!queue || !queue.songs.length) {
                return await bot.sendError(interaction, '無播放內容', '當前沒有正在播放的歌曲');
            }

            // Defer early — getAverageColor is a network request that can exceed Discord's 3s timeout
            await interaction.deferReply();

            const currentSong = queue.songs[0];
            const player = queue.player;
            const currentPosition = player?.position ?? 0;
            const isPaused = player?.paused ?? false;
            const nonTtsSongs = queue.songs.filter((s: any) => !s.isTTS);
            const nextSong = nonTtsSongs.length > 1 ? nonTtsSongs[1] : undefined;

            const accentColor = currentSong.thumbnail
                ? await MusicPresenter.computeAccentColor(currentSong.thumbnail)
                : undefined;

            const progressBar =
                currentSong.duration > 0
                    ? bot.music.createProgressBar(currentPosition, currentSong.duration)
                    : '🔴 直播流 (即時播放)';

            const payload = buildNowPlayingCard({
                song: currentSong,
                voiceChannelId: queue.voiceChannelId,
                currentPosition,
                isPaused,
                loopMode: queue.loopMode,
                queueLength: nonTtsSongs.length || 1,
                nextSongTitle: nextSong?.title,
                progressBar,
                accentColor
            });

            if (typeof interaction.editReply === 'function') {
                await interaction.editReply(payload);
            } else if (typeof interaction.followUp === 'function') {
                await interaction.followUp(payload);
            }

            // 啟動 Option 1：安全實時刷新循環（5 秒間隔，符合 Discord Rate Limit 規範）
            if (currentSong.duration > 0) {
                // 清除該公會先前的定時器（確保同一時間只有最新一條卡片處於活躍刷新狀態）
                if (typeof queue.clearNowPlayingTimer === 'function') {
                    queue.clearNowPlayingTimer();
                } else if ((queue as any).nowPlayingTimer) {
                    clearInterval((queue as any).nowPlayingTimer);
                    (queue as any).nowPlayingTimer = null;
                }

                const songIdentifier = currentSong.encoded || currentSong.title;
                const startTime = Date.now();
                const MAX_LIFETIME_MS = 14 * 60 * 1000; // 14 minutes Discord webhook token lifetime
                let isFinalized = false;
                let endTimeout: any = null;

                const renderFrame = async (pos: number, isFinished: boolean = false) => {
                    if (isFinalized && !isFinished) return;
                    if (isFinished) isFinalized = true;

                    const activeQueue = bot.music.getQueue(interaction.guild.id);
                    const safePosition = Math.max(0, Math.min(pos, currentSong.duration));
                    const activeNonTtsSongs = activeQueue?.songs ? activeQueue.songs.filter((s: any) => !s.isTTS) : [];
                    const nextTrack = activeNonTtsSongs.length > 1 ? activeNonTtsSongs[1] : undefined;
                    const progress =
                        typeof bot.music.createProgressBar === 'function'
                            ? bot.music.createProgressBar(safePosition, currentSong.duration)
                            : undefined;

                    const updatedPayload = buildNowPlayingCard({
                        song: currentSong,
                        voiceChannelId: activeQueue?.voiceChannelId || queue.voiceChannelId,
                        currentPosition: safePosition,
                        isPaused: isFinished ? false : (activeQueue?.player?.paused ?? false),
                        loopMode: activeQueue?.loopMode || queue.loopMode,
                        queueLength: activeNonTtsSongs.length || 1,
                        nextSongTitle: nextTrack?.title,
                        progressBar: progress,
                        accentColor
                    });

                    if (typeof interaction.editReply === 'function') {
                        await interaction.editReply(updatedPayload);
                    }
                };

                const finalizer = async () => {
                    if (isFinalized) return;
                    if (endTimeout) {
                        clearTimeout(endTimeout);
                        endTimeout = null;
                    }
                    try {
                        await renderFrame(currentSong.duration, true);
                    } catch {
                        // Ignore finalization network/API errors (e.g. deleted message)
                    }
                };

                const timer = setInterval(async () => {
                    try {
                        if (isFinalized) {
                            if (typeof queue?.clearNowPlayingTimer === 'function') {
                                queue.clearNowPlayingTimer();
                            } else {
                                clearInterval(timer);
                            }
                            return;
                        }

                        // 14 分鐘 Discord Webhook Token 過期安全防護（主動結算並終止循環）
                        if (Date.now() - startTime >= MAX_LIFETIME_MS) {
                            await finalizer();
                            const activeQueue = bot.music.getQueue(interaction.guild.id);
                            if (typeof activeQueue?.clearNowPlayingTimer === 'function') {
                                activeQueue.clearNowPlayingTimer();
                            } else {
                                clearInterval(timer);
                            }
                            return;
                        }

                        const activeQueue = bot.music.getQueue(interaction.guild.id);
                        if (
                            !activeQueue ||
                            (typeof activeQueue.isEmpty === 'function' && activeQueue.isEmpty()) ||
                            !activeQueue.songs?.length
                        ) {
                            await finalizer();
                            if (typeof activeQueue?.clearNowPlayingTimer === 'function') {
                                activeQueue.clearNowPlayingTimer();
                            } else {
                                clearInterval(timer);
                            }
                            return;
                        }

                        const songNow = activeQueue.songs[0];
                        const songNowIdentifier = songNow.encoded || songNow.title;
                        if (songNowIdentifier !== songIdentifier) {
                            // 若當前正被 TTS 廣播插播，且原本正在播放的音樂仍在佇列中等待恢復播放，則暫緩更新，不觸發結束結算
                            const isWaitingForResume = activeQueue.songs.some(
                                (s: any) => !s.isTTS && (s.encoded || s.title) === songIdentifier
                            );
                            if (songNow.isTTS && isWaitingForResume) {
                                if (endTimeout) {
                                    clearTimeout(endTimeout);
                                    endTimeout = null;
                                }
                                return;
                            }

                            await finalizer();
                            if (typeof activeQueue.clearNowPlayingTimer === 'function') {
                                activeQueue.clearNowPlayingTimer();
                            } else {
                                clearInterval(timer);
                            }
                            return;
                        }

                        const activePlayer = activeQueue.player;
                        const isCurrentlyPaused = activePlayer?.paused ?? false;
                        if (isCurrentlyPaused) {
                            if (endTimeout) {
                                clearTimeout(endTimeout);
                                endTimeout = null;
                            }
                            // 暫停狀態下進度未前進，跳過本次編輯以節省 API 速率限制額度
                            return;
                        }

                        const position = activePlayer?.position ?? 0;
                        if (position >= songNow.duration && songNow.duration > 0) {
                            await finalizer();
                            if (typeof activeQueue.clearNowPlayingTimer === 'function') {
                                activeQueue.clearNowPlayingTimer();
                            } else {
                                clearInterval(timer);
                            }
                            return;
                        }

                        await renderFrame(position, false);

                        // 若剩餘時長小於正常刷新間隔（如 3:24 至 3:27 僅剩 3 秒），排定精準終點定時器以確保跳到最後滿額進度
                        const remaining = songNow.duration - position;
                        if (remaining > 0 && remaining < NOWPLAYING_REFRESH_INTERVAL_MS && !endTimeout) {
                            endTimeout = setTimeout(
                                async () => {
                                    try {
                                        await finalizer();
                                        const q = bot.music.getQueue(interaction.guild.id);
                                        if (typeof q?.clearNowPlayingTimer === 'function') {
                                            q.clearNowPlayingTimer();
                                        } else {
                                            clearInterval(timer);
                                        }
                                    } catch {
                                        clearInterval(timer);
                                    }
                                },
                                Math.max(500, remaining)
                            );
                            if (typeof (endTimeout as any).unref === 'function') {
                                (endTimeout as any).unref();
                            }
                        }
                    } catch {
                        // 遇到 Discord 10008 (訊息已被刪除)、權限不足或 Token 過期時自動退出並清理隊列定時器
                        isFinalized = true;
                        clearInterval(timer);
                        if (endTimeout) clearTimeout(endTimeout);
                        const q = bot.music.getQueue(interaction.guild.id);
                        if (typeof q?.clearNowPlayingTimer === 'function') {
                            q.clearNowPlayingTimer();
                        }
                    }
                }, NOWPLAYING_REFRESH_INTERVAL_MS);

                if (typeof (timer as any).unref === 'function') {
                    (timer as any).unref();
                }

                if (typeof queue.setNowPlayingTimer === 'function') {
                    queue.setNowPlayingTimer(timer, finalizer);
                } else {
                    (queue as any).nowPlayingTimer = timer;
                }
            }
        } catch (err: any) {
            console.error('[NowPlaying CMD]', err);
            await bot.sendError(interaction, '查詢失敗', '無法取得目前播放資訊，請稍後再試。');
        }
    }
};

export default command;
