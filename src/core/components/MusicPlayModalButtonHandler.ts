import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import BaseComponentHandler from './BaseComponentHandler';
import type BotClient from '../BotClient';

/**
 * MusicPlayModalButtonHandler — Handles 'music:open_play_modal' button clicks.
 * Opens an interactive pop-up modal so users can easily type song titles or URLs.
 */
class MusicPlayModalButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'music:open_play_modal';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        try {
            const userVoiceChannel = interaction.member.voice?.channel;
            if (!userVoiceChannel) {
                return await bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道才能點播歌曲!');
            }

            const modal = new ModalBuilder().setCustomId('music:modal:play').setTitle('🎵 點播音樂');

            const queryInput = new TextInputBuilder()
                .setCustomId('query')
                .setLabel('歌曲名稱或串流 URL (YouTube / SoundCloud)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('例如：夜に駆ける 或貼上 YouTube 連結')
                .setRequired(true);

            const row = new ActionRowBuilder<TextInputBuilder>().addComponents(queryInput);
            modal.addComponents(row);

            if (typeof interaction.showModal === 'function') {
                await interaction.showModal(modal);
            }
        } catch (err: any) {
            console.error('[MusicPlayModalButtonHandler]', err);
            await bot.sendError(interaction, '彈窗開啟失敗', '開啟點歌視窗時發生內部錯誤，請稍後再試。');
        }
    }
}

export default MusicPlayModalButtonHandler;
