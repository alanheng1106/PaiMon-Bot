import { ModalSubmitInteraction } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import MusicPresenter from '../music/MusicPresenter';
import type BotClient from '../BotClient';

/**
 * MusicPlayModalSubmitHandler — Handles 'music:modal:play' modal submissions.
 * Searches and plays the requested song or playlist in the user's voice channel.
 */
class MusicPlayModalSubmitHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'music:modal:play';
    }

    override async execute(interaction: ModalSubmitInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        const query = interaction.fields?.getTextInputValue('query')?.trim();
        if (!query || query.length < 2) {
            return await bot.sendError(interaction, '搜尋詞過短', '歌曲關鍵字至少要 2 個字!');
        }
        if (query.length > 500) {
            return await bot.sendError(interaction, '搜尋詞過長', '關鍵字不能超過 500 個字!');
        }

        const voiceChannel = interaction.member.voice?.channel;
        if (!voiceChannel) {
            return await bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道才能點歌!');
        }

        if (!interaction.channel || !interaction.channel.isTextBased()) {
            return await bot.sendError(interaction, '頻道錯誤', '無法在此文字頻道接收指令.');
        }
        const textChannel = interaction.channel;

        if (typeof interaction.deferReply === 'function' && !interaction.deferred) {
            await interaction.deferReply();
        }

        try {
            const { isPlaylist, name, tracks, error } = await bot.music.search(query);
            if (!tracks?.length) {
                if (error) {
                    return await bot.sendError(interaction, '載入失敗', error);
                }
                return await bot.sendError(interaction, '查無結果', `找不到任何與 \`${query}\` 相符的結果。`);
            }

            if (isPlaylist) {
                await bot.music.playPlaylist(voiceChannel, textChannel, name || 'Playlist', tracks, interaction.user);
                if (interaction.deferred && !interaction.replied && typeof interaction.deleteReply === 'function') {
                    await interaction.deleteReply().catch(() => null);
                }
                return;
            }

            const track = tracks[0];
            await bot.music.play(voiceChannel, textChannel, track, interaction.user);

            // 若目前已有歌曲在播放中，向用戶發送「已加入佇列」反饋卡片
            const queue = bot.music.getQueue(interaction.guild.id);
            if (queue && queue.songs && queue.songs.length > 1) {
                const card = await MusicPresenter.buildAddedToQueueMessage(
                    track.info,
                    queue.songs.length,
                    interaction.user
                );
                if (interaction.deferred && !interaction.replied && typeof interaction.editReply === 'function') {
                    await interaction.editReply(card as any);
                }
            } else {
                if (interaction.deferred && !interaction.replied && typeof interaction.deleteReply === 'function') {
                    await interaction.deleteReply().catch(() => null);
                }
            }
        } catch (err: any) {
            console.error('[MusicPlayModalSubmitHandler]', err);
            await bot.sendError(interaction, '點歌失敗', '加入歌曲時發生內部錯誤，請稍後再試。');
        }
    }
}

export default MusicPlayModalSubmitHandler;
