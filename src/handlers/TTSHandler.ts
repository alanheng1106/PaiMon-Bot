import * as googleTTS from 'google-tts-api';
import { Message } from 'discord.js';
import BaseMessageHandler from '../pipeline/BaseMessageHandler';
import type BotClient from '../core/BotClient';

/**
 * TTSHandler — Handles automated text-to-speech voice channel audio playback.
 */
class TTSHandler extends BaseMessageHandler {
    /**
     * Process message content for TTS voice playback.
     */
    override async handle(message: Message, bot: BotClient | any): Promise<boolean> {
        if (!message.guild || !message.content) return false;

        const ttsSettings = bot.settings.get(message.guild.id, 'tts');
        if (!ttsSettings || ttsSettings.channelId !== message.channel.id) return false;

        // Find a voice channel with active users
        let targetVc: any = message.guild.members.me?.voice.channel;
        if (!targetVc) {
            const channels = message.guild.channels.cache.filter((c: any) => c.isVoiceBased());
            targetVc = channels.find((c: any) => c.members.filter((m: any) => !m.user.bot).size > 0);
        }

        if (!targetVc) return false;

        const userName = message.member?.displayName || message.author.username;

        // Clean custom emojis and replace URLs
        let cleanText = message.cleanContent.replace(/<a?:.+?:\d+>/g, '').trim();
        cleanText = cleanText.replace(/https?:\/\/[^\s]+/g, '連結').trim();

        let attachmentText = '';
        if (message.attachments.size > 0) {
            const hasImage = message.attachments.some((a) => a.contentType?.startsWith('image/'));
            const hasVideo = message.attachments.some((a) => a.contentType?.startsWith('video/'));
            const hasAudio = message.attachments.some((a) => a.contentType?.startsWith('audio/'));

            if (hasImage) attachmentText = '圖片';
            else if (hasVideo) attachmentText = '影片';
            else if (hasAudio) attachmentText = '音檔';
            else attachmentText = '檔案';
        }

        let textToSpeak = '';
        if (cleanText && attachmentText) {
            if (cleanText.match(/^(連結\s*)+$/)) {
                textToSpeak = `${userName}發送了連結和${attachmentText}`;
            } else {
                textToSpeak = `${userName}說：${cleanText} , 並發送了${attachmentText}`;
            }
        } else if (cleanText) {
            if (cleanText.match(/^(連結\s*)+$/)) {
                textToSpeak = `${userName}發送了連結`;
            } else {
                textToSpeak = `${userName}說：${cleanText}`;
            }
        } else if (attachmentText) {
            textToSpeak = `${userName}發送了${attachmentText}`;
        }

        if (!textToSpeak) return false;

        textToSpeak = textToSpeak.slice(0, 200);

        try {
            const url = googleTTS.getAudioUrl(textToSpeak, {
                lang: ttsSettings.lang || 'zh-TW',
                slow: false,
                host: 'https://translate.google.com'
            });

            // Race against a 5-second timeout — Google TTS is an unofficial API that can hang
            const TTS_TIMEOUT_MS = 5000;
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TTS search timed out after 5s')), TTS_TIMEOUT_MS)
            );

            const { tracks }: any = await Promise.race([bot.music.search(url), timeoutPromise]);
            if (tracks && tracks.length > 0) {
                const track = tracks[0];
                track.info.title = `TTS: ${textToSpeak}`;
                track.info.author = `Language: ${ttsSettings.lang || 'zh-TW'}`;
                await bot.music.play(targetVc, message.channel, track, message.author, { isTTS: true });
                return true;
            }
        } catch (err: any) {
            console.error('[TTSHandler] Error playing TTS audio:', err.message);
        }

        return false;
    }
}

export default TTSHandler;
