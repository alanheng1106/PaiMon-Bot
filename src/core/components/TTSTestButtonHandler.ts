import { ButtonInteraction, PermissionFlagsBits, MessageFlags } from 'discord.js';
import * as googleTTS from 'google-tts-api';
import BaseComponentHandler from './BaseComponentHandler';
import type BotClient from '../BotClient';
import type { SearchResult } from '../MusicManager';
import type { TTSSettings } from '../../commands/admin/ttschannel';

const TEST_PHRASES: Record<string, string> = {
    'zh-TW': '自動語音朗讀測試成功，語音服務運作正常。',
    en: 'Automated text to speech test successful. Voice service is running normally.',
    ja: '自動音声読み上げテストに成功しました。正常に動作しています。',
    ko: '자동 음성 읽기 테스트 성공. 음성 서비스가 정상 작동 중입니다.',
    'zh-CN': '自动语音朗读测试成功，语音服务运作正常。',
    fr: 'Test de synthèse vocale réussi. Le service vocal fonctionne normalement.',
    es: 'Prueba de texto a voz exitosa. El servicio de voz funciona con normalidad.'
};

/**
 * TTSTestButtonHandler — Handles 'tts:test:<channelId>' button clicks.
 * Allows administrators to verify TTS voice audio directly in their current voice channel.
 */
class TTSTestButtonHandler extends BaseComponentHandler {
    override get customId(): string {
        return 'tts:test';
    }

    override async execute(interaction: ButtonInteraction, bot: BotClient): Promise<void> {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此操作僅能在伺服器內使用.');
        }

        try {
            // 1. 檢查點擊者管理權限
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return await bot.sendError(
                    interaction,
                    '權限不足',
                    '你需要「管理伺服器」(Manage Server) 權限才能測試自動 TTS 頻道設定。'
                );
            }

            // 2. 檢查點擊者是否在語音頻道
            const voiceChannel = interaction.member.voice?.channel;
            if (!voiceChannel) {
                return await bot.sendError(interaction, '語音錯誤', '請先加入語音頻道，機器人才能為你播放測試語音！');
            }

            // 3. 檢查機器人權限與頻道狀態
            const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe().catch(() => null));
            if (!me) {
                return await bot.sendError(interaction, '權限被拒絕', '無法取得機器人身分資訊。');
            }

            const permissions = voiceChannel.permissionsFor(me);
            if (!permissions?.has(['Connect', 'Speak'])) {
                return await bot.sendError(
                    interaction,
                    '權限被拒絕',
                    '我在該語音頻道缺少 `連線 (Connect)` 或 `說話 (Speak)` 的權限！'
                );
            }

            const botVoiceChannel = me.voice?.channel;
            if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
                return await bot.sendError(
                    interaction,
                    '不在同一頻道',
                    `機器人目前已在其他語音頻道 (<#${botVoiceChannel.id}>) 裡！`
                );
            }

            // 4. 取得該伺服器配置的 TTS 語言
            const currentSettings = bot.settings.get<TTSSettings>(interaction.guild.id, 'tts');
            const lang = currentSettings?.lang || 'zh-TW';
            const phrase = TEST_PHRASES[lang] || TEST_PHRASES['zh-TW'];

            // 5. 延遲回覆避免 TTS API 逾時
            if (typeof interaction.deferReply === 'function') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            }

            const url = googleTTS.getAudioUrl(phrase, {
                lang: lang,
                slow: false,
                host: 'https://translate.google.com'
            });

            const TTS_TIMEOUT_MS = 5000;
            let timeoutId: NodeJS.Timeout | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('TTS search timed out after 5s')), TTS_TIMEOUT_MS);
            });

            let searchResult: SearchResult | undefined;
            try {
                searchResult = await Promise.race<SearchResult>([bot.music.search(url), timeoutPromise]);
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }

            const tracks = searchResult?.tracks;
            if (!tracks || tracks.length === 0) {
                return await bot.sendError(interaction, 'TTS 錯誤', '無法產生測試語音音訊。');
            }

            const track = tracks[0];
            if (track?.info) {
                track.info.title = `TTS Test: ${phrase}`;
                track.info.author = `Language: ${lang}`;
            }

            await bot.music.play(voiceChannel, interaction.channel, track, interaction.user, {
                isTTS: true
            });

            await bot.sendSuccess(
                interaction,
                '🔊 測試語音播放中',
                `已在語音頻道 <#${voiceChannel.id}> 播放測試音訊。\n**語言**：\`${lang}\`\n**內容**：${phrase}`,
                true
            );
        } catch (err: any) {
            console.error('[TTSTestHandler] Error playing test audio:', err.message);
            await bot.sendError(interaction, '執行失敗', '播放測試語音時出了點問題, 請稍後再試.');
        }
    }
}

export default TTSTestButtonHandler;
