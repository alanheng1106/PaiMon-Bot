import { ButtonInteraction, MessageFlags } from 'discord.js';
import * as googleTTS from 'google-tts-api';
import BaseComponentHandler from './BaseComponentHandler';
import type BotClient from '../BotClient';
import type { SearchResult } from '../MusicManager';
import { getTTSReplay } from '../../commands/general/tts';

/**
 * TTSReplayButtonHandler — Handles 'tts:replay:<id>' button clicks on TTS broadcast console cards.
 * Allows users in the voice channel to replay the spoken text with one click.
 */
class TTSReplayButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'tts:replay';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        try {
            const replayId = interaction.customId.replace(/^tts:replay:/, '').trim();
            const cached = getTTSReplay(replayId);
            if (!cached) {
                return await bot.sendError(
                    interaction,
                    '快取已過期',
                    '該則語音的快取記錄已過期或不存在，請使用 `/tts` 指令重新發送。'
                );
            }

            // 1. 檢查點擊用戶的語音狀態
            const userVoiceChannel = interaction.member.voice?.channel;
            if (!userVoiceChannel) {
                return await bot.sendError(interaction, '語音錯誤', '請先加入語音頻道，機器人才能為你重播語音！');
            }

            // 2. 檢查機器人身分與權限
            const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
            if (!me) {
                return await bot.sendError(interaction, '權限被拒絕', '無法取得機器人身分資訊。');
            }

            const permissions = userVoiceChannel.permissionsFor(me);
            if (!permissions?.has(['Connect', 'Speak'])) {
                return await bot.sendError(
                    interaction,
                    '權限被拒絕',
                    '我在該語音頻道缺少 `連線 (Connect)` 或 `說話 (Speak)` 的權限！'
                );
            }

            // 3. 檢查機器人是否已被佔用在其他頻道
            const botVoiceChannel = me.voice?.channel;
            if (botVoiceChannel && botVoiceChannel.id !== userVoiceChannel.id) {
                return await bot.sendError(
                    interaction,
                    '不在同一頻道',
                    `機器人目前已在其他語音頻道 (<#${botVoiceChannel.id}>) 裡！`
                );
            }

            const textChannel = interaction.channel;
            if (!textChannel || !textChannel.isTextBased()) {
                return await bot.sendError(interaction, '頻道錯誤', '無法在此文字頻道發送訊息。');
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // 4. 取得音訊 URL 並搜尋
            const url = googleTTS.getAudioUrl(cached.text, {
                lang: cached.lang,
                slow: false,
                host: 'https://translate.google.com'
            });

            const TTS_TIMEOUT_MS = 5000;
            let timeoutId: NodeJS.Timeout | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('TTS search timed out after 5s')), TTS_TIMEOUT_MS);
            });

            let searchResult: SearchResult;
            try {
                searchResult = await Promise.race<SearchResult>([bot.music.search(url), timeoutPromise]);
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }

            const tracks = searchResult?.tracks;
            if (!tracks || tracks.length === 0) {
                return await bot.sendError(interaction, 'TTS 錯誤', '無法產生語音。');
            }

            const track = tracks[0];
            if (track?.info) {
                track.info.title = `TTS: ${cached.text}`;
                track.info.author = `Language: ${cached.lang}`;
            }

            // 5. 播放重播語音
            await bot.music.play(userVoiceChannel, textChannel, track, interaction.user, {
                isTTS: true
            });

            await bot.sendSuccess(
                interaction,
                '🔁 語音重播中',
                `已為你在 <#${userVoiceChannel.id}> 重新播放該則語音：\n\`\`\`text\n${cached.text}\n\`\`\``,
                true
            );
        } catch (err: any) {
            console.error('[TTSReplayButtonHandler] Error replaying audio:', err);
            await bot.sendError(interaction, '執行失敗', '重播語音時發生錯誤，請稍後再試。');
        }
    }
}

export default TTSReplayButtonHandler;
