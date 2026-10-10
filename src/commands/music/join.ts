import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';
import { Colors } from '../../config';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

export interface JoinSuccessCardParams {
    voiceChannelId: string;
    textChannelId: string;
    executorId?: string;
    botAvatarUrl?: string;
}

/**
 * 方案 1：【交互控制台·功能網關型】CV2 卡片建構器
 * 融合大標題 (H1)、細間距 Separator、圖文並茂 Section (帶 Thumbnail)、
 * 雙快捷操作按鈕行 (點播/退出) 與 -# 次要微字引導。
 */
export function buildJoinSuccessCard(params: JoinSuccessCardParams) {
    const { voiceChannelId, textChannelId, executorId, botAvatarUrl } = params;

    // 1. 核心狀態區塊（Section 內容）
    const statusLines = [`**📡 語音頻道**：<#${voiceChannelId}>`, `**💬 指令頻道**：<#${textChannelId}>`];
    if (executorId) {
        statusLines.push(`**👤 召喚成員**：<@${executorId}>`);
    }

    // 2. 快捷操作按鈕行（消除操作斷頭路）
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('music:open_play_modal')
            .setLabel('點播歌曲')
            .setEmoji('🎵')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`music:disconnect:${voiceChannelId}`)
            .setLabel('退出語音')
            .setEmoji('🔇')
            .setStyle(ButtonStyle.Secondary)
    );

    // 3. 組裝 Container
    const container = new ContainerBuilder()
        .setAccentColor(Colors.Music) // 0x5865f2 Discord Blurple 保持音樂語境統一
        // Heading 1 大標題：建立沉浸式場景感
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🔊 語音連線已建立'))
        // 標題與狀態資訊之間的細分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    if (botAvatarUrl) {
        // 中間圖文 Section（文字 + 機器人頭像 Thumbnail）
        const statusSection = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(statusLines.join('\n')))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatarUrl));
        container.addSectionComponents(statusSection);
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statusLines.join('\n')));
    }

    container
        // 狀態區與操作按鈕區的分割線
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 獨立操作按鈕行
        .addActionRowComponents(actionRow)
        // 底部次要微字引導（避免主要內容擁擠）
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '-# 💡 提示：點擊上方「點播歌曲」或在此頻道輸入 `/play 歌曲名稱` 即可開始播放音樂。'
            )
        );

    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2 as any
    };
}

const command: Command = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('讓機器人加入你所在的語音頻道')
        .setDMPermission(false),
    category: 'music',
    helpText: '🔹 `/join` - 召喚機器人加入你目前所在的語音頻道',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        if (!interaction.inCachedGuild()) {
            return await bot.sendError(interaction, '無法執行', '此指令僅能在伺服器內使用.');
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return await bot.sendError(interaction, '語音連線遭拒', '你要先加入語音頻道!');
        }

        const me = interaction.guild.members.me;
        if (!me) {
            return await bot.sendError(interaction, '語音連線遭拒', '無法取得機器人身分資訊!');
        }

        const permissions = voiceChannel.permissionsFor(me);
        if (!permissions?.has(['Connect', 'Speak'])) {
            return await bot.sendError(
                interaction,
                '權限被拒絕',
                '我在此頻道缺少 `連線 (Connect)` 或 `說話 (Speak)` 的權限, 無法進入!'
            );
        }

        const botVoiceChannel = interaction.guild.members.me?.voice.channel;
        if (botVoiceChannel) {
            if (botVoiceChannel.id === voiceChannel.id) {
                return await bot.sendError(interaction, '已在頻道中', '我已經在該語音頻道中了!');
            }
            return await bot.sendError(
                interaction,
                '頻道衝突',
                `我已經在 <#${botVoiceChannel.id}> 裡了，請先讓我離開或加入該頻道!`
            );
        }

        if (!interaction.channel || !interaction.channel.isTextBased()) {
            return await bot.sendError(interaction, '頻道錯誤', '無法在此文字頻道發送訊息.');
        }

        await interaction.deferReply();

        try {
            await bot.music.join(voiceChannel, interaction.channel);

            const executorId = interaction.user?.id ?? interaction.member?.user?.id ?? interaction.member?.id;
            const botAvatarUrl =
                interaction.client?.user?.displayAvatarURL?.() ??
                bot?.user?.displayAvatarURL?.() ??
                (bot as any)?.client?.user?.displayAvatarURL?.();

            const payload = buildJoinSuccessCard({
                voiceChannelId: voiceChannel.id,
                textChannelId: interaction.channel.id,
                executorId,
                botAvatarUrl: botAvatarUrl || undefined
            });

            if (interaction.deferred && !interaction.replied && typeof interaction.editReply === 'function') {
                await interaction.editReply(payload);
            } else if (interaction.replied && typeof interaction.followUp === 'function') {
                await interaction.followUp(payload);
            } else if (typeof interaction.reply === 'function' && !interaction.deferred) {
                await interaction.reply(payload);
            } else if (typeof bot.sendSuccess === 'function') {
                await bot.sendSuccess(interaction, '🔊 成功加入', `已成功加入語音頻道: <#${voiceChannel.id}>`);
            }
        } catch (err: any) {
            console.error('[Join CMD]', err);
            await bot.sendError(interaction, '加入失敗', '加入語音頻道時發生內部錯誤，請稍後再試。');
        }
    }
};

export default command;
