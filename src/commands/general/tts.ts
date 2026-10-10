import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';
import * as googleTTS from 'google-tts-api';
import { Colors } from '../../config';
import { TTS_LANG_LABELS } from '../admin/ttschannel';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';
import type { SearchResult } from '../../core/MusicManager';

export interface CachedTTSItem {
    text: string;
    lang: string;
    userId: string;
    guildId?: string;
    createdAt: number;
}

/**
 * In-memory cache for recent TTS utterances to power interactive replay buttons.
 */
export const ttsReplayCache = new Map<string, CachedTTSItem>();

/**
 * Store a TTS utterance in the replay cache and return a short identifier.
 */
export function storeTTSReplay(text: string, lang: string, userId: string, guildId?: string): string {
    const replayId = Math.random().toString(36).substring(2, 10);
    const now = Date.now();

    // Clean up expired items (> 15 minutes)
    for (const [id, item] of ttsReplayCache.entries()) {
        if (now - item.createdAt > 15 * 60 * 1000) {
            ttsReplayCache.delete(id);
        }
    }

    ttsReplayCache.set(replayId, { text, lang, userId, guildId, createdAt: now });
    return replayId;
}

/**
 * Retrieve a cached TTS utterance by its replay ID.
 */
export function getTTSReplay(replayId: string): CachedTTSItem | undefined {
    const item = ttsReplayCache.get(replayId);
    if (!item) return undefined;
    if (Date.now() - item.createdAt > 15 * 60 * 1000) {
        ttsReplayCache.delete(replayId);
        return undefined;
    }
    return item;
}

export interface BuildTTSBroadcastCardOptions {
    text: string;
    lang: string;
    user: { id?: string; username?: string };
    voiceChannel: { id?: string; name?: string };
    replayId?: string;
    timestamp?: number;
}

/**
 * Builds the interactive CV2 console card for TTS voice broadcast receipts (Scheme C: Studio Console).
 * Features:
 * - Left Accent: Audio Blurple (Colors.Music 0x5865f2) indicating sound broadcast
 * - Header: Heading 1 Anchor (# 🎙️ TTS 語音廣播回執)
 * - Divider: Small spacing divider line
 * - Dual-Column Indicators: Target voice channel, language badge, broadcaster user, and live playing status
 * - Divider: Small spacing divider line
 * - Content: Full-width text highlight block showcasing speech transcript cleanly
 * - Divider: Small spacing divider line before interactive control buttons
 * - ActionRow:
 *   - Quick Replay button (Secondary, 🔁 重播發音)
 *   - Quick Stop button (Danger, ⏹️ 停止播放)
 * - Footer: Minimalist subtext hint with relative timestamp
 */
export function buildTTSBroadcastCard({
    text,
    lang,
    user,
    voiceChannel,
    replayId,
    timestamp = Math.floor(Date.now() / 1000)
}: BuildTTSBroadcastCardOptions) {
    const langLabel = TTS_LANG_LABELS[lang] || lang;
    const channelDisplay = voiceChannel?.id
        ? `<#${voiceChannel.id}>`
        : voiceChannel?.name
          ? `**#${voiceChannel.name}**`
          : '未指定頻道';
    const userDisplay = user?.id ? `<@${user.id}>` : (user?.username ?? '成員');
    const sanitizedText = text.replace(/```/g, '`\u200B`\u200B`');

    const container = new ContainerBuilder()
        .setAccentColor(Colors.Music)
        // 1. Heading 1 大標題（24px 粗體，建立頂層核心視覺錨點）
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🎙️ TTS 語音廣播回執'))
        // 2. 標題與元數據分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 3. 雙欄對齊指標
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `📡 **目標頻道**：${channelDisplay} ｜ 🌐 **語言模式**：\`${langLabel}\`\n` +
                    `👤 **廣播成員**：${userDisplay} ｜ ⚡ **播放狀態**：\`🟢 播放中\``
            )
        )
        // 4. 元數據與台詞正文分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 5. 播報內容區（全寬高亮代碼塊，突出台詞內容）
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`text\n${sanitizedText}\n\`\`\``))
        // 6. 異構邊界分割線 + 控制按鈕行
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    if (replayId) {
        actionRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`tts:replay:${replayId}`)
                .setLabel('重播發音')
                .setEmoji('🔁')
                .setStyle(ButtonStyle.Secondary)
        );
    }
    actionRow.addComponents(
        new ButtonBuilder().setCustomId('tts:stop').setLabel('停止播放').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
    );

    container.addActionRowComponents(actionRow);

    // 7. 底部降權審計腳注
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# 💡 管理員可使用 /ttschannel 設定自動朗讀頻道 • 發送於 <t:${timestamp}:R>`
        )
    );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2
    };
}

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('tts')
        .setDescription('使用 Google TTS 將文字轉語音並在語音頻道播放')
        .addStringOption((option) => option.setName('text').setDescription('要轉換為語音的文字').setRequired(true))
        .addStringOption((option) =>
            option
                .setName('lang')
                .setDescription('語言代碼 (預設: zh-TW)')
                .setRequired(false)
                .addChoices(
                    { name: '🇹🇼 繁體中文 (zh-TW)', value: 'zh-TW' },
                    { name: '🇺🇸 英文 (en)', value: 'en' },
                    { name: '🇯🇵 日文 (ja)', value: 'ja' },
                    { name: '🇰🇷 韓文 (ko)', value: 'ko' },
                    { name: '🇨🇳 簡體中文 (zh-CN)', value: 'zh-CN' },
                    { name: '🇫🇷 法文 (fr)', value: 'fr' },
                    { name: '🇪🇸 西班牙文 (es)', value: 'es' }
                )
        )
        .setDMPermission(false),
    category: 'general',
    cooldown: 5,
    helpText: '🔹 `/tts [文字] [語言]` - 將文字轉成語音在語音頻道播放, 支援繁中, 英文, 日文等多種語言',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        await interaction.deferReply();

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return await bot.sendError(interaction, '語音錯誤', '你要先加入語音頻道!');
        }

        const me = interaction.guild.members.me;
        if (!me) {
            return await bot.sendError(interaction, '權限被拒絕', '無法取得機器人身分資訊');
        }

        const permissions = voiceChannel.permissionsFor(me);
        if (!permissions?.has(['Connect', 'Speak'])) {
            return await bot.sendError(
                interaction,
                '權限被拒絕',
                '我在這個頻道缺少 `連線 (Connect)` 或 `說話 (Speak)` 的權限!'
            );
        }

        const botVoiceChannel = me.voice.channel;
        if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
            return await bot.sendError(
                interaction,
                '不在同一頻道',
                `我已經在語音頻道 (<#${botVoiceChannel.id}>) 裡了!`
            );
        }

        const text = interaction.options.getString('text', true).trim();
        const lang = interaction.options.getString('lang') || 'zh-TW';

        if (!text) {
            return await bot.sendError(interaction, '內容無效', '請提供要轉換為語音的文字內容，不能僅包含空白字元!');
        }

        if (text.length > 200) {
            return await bot.sendError(interaction, '字數過長', '文字不能超過 200 個字元!');
        }

        const textChannel = interaction.channel;
        if (!textChannel || !textChannel.isTextBased()) {
            return await bot.sendError(interaction, '頻道錯誤', '無法在此文字頻道發送訊息.');
        }

        try {
            const url = googleTTS.getAudioUrl(text, {
                lang: lang,
                slow: false,
                host: 'https://translate.google.com'
            });

            // Race against a 5-second timeout — Google TTS is an unofficial API that can hang
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
                return await bot.sendError(interaction, 'TTS 錯誤', '無法產生語音.');
            }

            const track = tracks[0];
            if (track?.info) {
                track.info.title = `TTS: ${text}`;
                track.info.author = `Language: ${lang}`;
            }

            await bot.music.play(voiceChannel, textChannel, track, interaction.user, {
                isTTS: true
            });

            const replayId = storeTTSReplay(text, lang, interaction.user.id, interaction.guild.id);
            const payload = buildTTSBroadcastCard({
                text,
                lang,
                user: interaction.user,
                voiceChannel,
                replayId
            });

            if (interaction.deferred && typeof interaction.editReply === 'function') {
                await interaction.editReply(payload as any);
            } else if (typeof interaction.reply === 'function') {
                await interaction.reply(payload as any);
            } else {
                await bot.sendSuccess(interaction, '🗣️ 文字轉語音', `**內容:** ${text}\n**語言:** ${lang}`);
            }
        } catch (error: any) {
            console.error('[TTS CMD]', error.message);
            await bot.sendError(interaction, 'TTS 錯誤', 'TTS 處理時出了點問題, 請稍後再試.');
        }
    }
};

export default command;
