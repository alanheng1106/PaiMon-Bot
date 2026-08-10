const googleTTS = require('google-tts-api');
const BaseMessageHandler = require('../pipeline/BaseMessageHandler');

/**
 * TTSHandler — Handles automated text-to-speech voice channel audio playback.
 */
class TTSHandler extends BaseMessageHandler {
    /**
     * Process message content for TTS voice playback.
     * @param {import('discord.js').Message} message 
     * @param {Object} bot 
     * @returns {Promise<boolean>} Returns true if TTS audio was played/queued
     */
    async handle(message, bot) {
        if (!message.guild || !message.content) return false;

        const ttsSettings = bot.settings.get(message.guild.id, 'tts');
        if (!ttsSettings || ttsSettings.channelId !== message.channel.id) return false;

        // Find a voice channel with active users
        let targetVc = message.guild.members.me.voice.channel;
        if (!targetVc) {
            const channels = message.guild.channels.cache.filter(c => c.isVoiceBased());
            targetVc = channels.find(c => c.members.filter(m => !m.user.bot).size > 0);
        }

        if (!targetVc) return false;

        const userName = message.member?.displayName || message.author.username;

        // Clean custom emojis and replace URLs
        let cleanText = message.cleanContent.replace(/<a?:.+?:\d+>/g, '').trim();
        cleanText = cleanText.replace(/https?:\/\/[^\s]+/g, '連結').trim();

        let attachmentText = '';
        if (message.attachments.size > 0) {
            const hasImage = message.attachments.some(a => a.contentType?.startsWith('image/'));
            const hasVideo = message.attachments.some(a => a.contentType?.startsWith('video/'));
            const hasAudio = message.attachments.some(a => a.contentType?.startsWith('audio/'));

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

            const { tracks } = await bot.music.search(url);
            if (tracks && tracks.length > 0) {
                const track = tracks[0];
                track.info.title = `TTS: ${textToSpeak}`;
                track.info.author = `Language: ${ttsSettings.lang || 'zh-TW'}`;
                await bot.music.play(targetVc, message.channel, track, message.author, { isTTS: true });
                return true;
            }
        } catch (err) {
            console.error('[TTSHandler] Error playing TTS audio:', err.message);
        }

        return false;
    }
}

module.exports = TTSHandler;

