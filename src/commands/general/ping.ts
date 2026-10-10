import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags,
    ChatInputCommandInteraction,
    ButtonInteraction
} from 'discord.js';
import fs from 'fs';
import { Colors, Emojis, AI as AIConfig } from '../../config';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

export interface SubsystemStatus {
    latency: number;
    status: string;
}

export interface PingContainerOptions {
    roundtrip: number;
    wsPing: number;
    execTime?: number;
    ioTime?: number;
    lavalink?: SubsystemStatus;
    aiEngine?: SubsystemStatus;
    ollama?: SubsystemStatus; // Backwards-compatible alias for aiEngine
    disabled?: boolean;
    measuredAtUnix?: number;
}

/**
 * Measures local storage/settings I/O read access latency in milliseconds.
 * Safe fallback guarantees never throwing even in mock test environments.
 */
export async function measureStorageLatency(bot?: BotClient): Promise<number> {
    const start = performance.now();
    try {
        const targetPath = bot?.settings?.filePath || process.cwd();
        if (targetPath) {
            await fs.promises.stat(targetPath);
        }
    } catch {
        // Fallback: minimal safe value
    }
    return Math.max(0.1, Number((performance.now() - start).toFixed(1)));
}

/**
 * Measures active Lavalink audio node REST ping/connectivity.
 */
export async function measureLavalinkLatency(bot?: BotClient): Promise<SubsystemStatus> {
    try {
        const shoukaku = bot?.music?.shoukaku;
        if (!shoukaku || !shoukaku.nodes || shoukaku.nodes.size === 0) {
            return { latency: -1, status: '未配置' };
        }
        const node = shoukaku.nodes.values().next()?.value;
        if (!node || node.state !== 1) {
            return { latency: -1, status: '未連線' };
        }
        const start = performance.now();
        if (typeof node.rest?.getLavalinkInfo === 'function') {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 600));
            await Promise.race([node.rest.getLavalinkInfo(), timeoutPromise]);
            const rtt = Math.max(0.1, Number((performance.now() - start).toFixed(1)));
            return { latency: rtt, status: `${rtt}ms` };
        }
        return { latency: 0.1, status: '已連線' };
    } catch {
        return { latency: -1, status: '未連線' };
    }
}

/**
 * Measures AI Gateway (windowsed.me / active LLM provider) inference backend ping/connectivity.
 */
export async function measureAIEngineLatency(bot?: BotClient): Promise<SubsystemStatus> {
    try {
        if (bot?.ai && typeof (bot.ai as any).getActiveModel === 'function') {
            const active = bot.ai.getActiveModel();
            const provider = active?.provider as any;
            if (provider && typeof provider.testConnection === 'function') {
                const res = await provider.testConnection(1500);
                if (res.ok) {
                    return { latency: res.latency, status: `${res.latency}ms` };
                }
                return { latency: -1, status: res.error || '異常' };
            }
        }

        const baseURL =
            process.env.WINDOWSED_AI_BASE_URL ||
            process.env.VTC_AI_BASE_URL ||
            process.env.CUSTOM_AI_BASE_URL ||
            process.env.OPENAI_BASE_URL ||
            process.env.FRIEND_AI_BASE_URL ||
            (AIConfig as any)?.WindowsedAIBaseUrl ||
            (AIConfig as any)?.CustomAIBaseUrl ||
            'https://ai.windowsed.me/v1';

        const apiKey =
            process.env.WINDOWSED_AI_API_KEY ||
            process.env.VTC_AI_API_KEY ||
            process.env.CUSTOM_AI_API_KEY ||
            process.env.OPENAI_API_KEY ||
            process.env.FRIEND_AI_API_KEY ||
            (AIConfig as any)?.WindowsedAIApiKey ||
            (AIConfig as any)?.CustomAIApiKey ||
            '';

        const start = performance.now();
        const url = `${baseURL.replace(/\/+$/, '')}/models`;
        const res = await fetch(url, {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            signal: AbortSignal.timeout(1500)
        });

        const latency = Math.max(0.1, Number((performance.now() - start).toFixed(1)));
        if (res.ok || res.status === 401 || res.status === 403) {
            return { latency, status: `${latency}ms` };
        }
        return { latency: -1, status: '異常' };
    } catch {
        return { latency: -1, status: '未連線' };
    }
}

/**
 * Backwards-compatibility alias for measureAIEngineLatency
 */
export const measureOllamaLatency = measureAIEngineLatency;

/**
 * Builds a refined Discord Message Components V2 Container for /ping.
 * Implements Level-1 Heading (#), Section with Avatar Thumbnail,
 * 6-metric full-link diagnostics (Gateway, RTT, Compute, Disk I/O, Lavalink, AI Engine),
 * dynamic status accent colors, -# subtext timestamp, and an interactive refresh button.
 */
export function buildPingContainer(bot: BotClient, options: PingContainerOptions): ContainerBuilder {
    const {
        roundtrip,
        wsPing,
        execTime = 1.0,
        ioTime = 0.5,
        lavalink = { latency: -1, status: '未連線' },
        aiEngine,
        ollama,
        disabled = false,
        measuredAtUnix = Math.floor(Date.now() / 1000)
    } = options;

    const effectiveAI = aiEngine || ollama || { latency: -1, status: '未連線' };
    const wsFormatted = wsPing < 0 ? '連線中...' : `${Math.round(wsPing)}ms`;
    const effectiveLatency = Math.max(roundtrip, wsPing < 0 ? 0 : wsPing);

    let accentColor: number = Colors.Success;
    let statusBadge = '🟢 **全系統運作極佳**';
    let statusDesc = '全鏈路核心服務通訊延遲處於最佳安全區間';

    if (effectiveLatency > 200 && effectiveLatency <= 500) {
        accentColor = Colors.Warning;
        statusBadge = '🟡 **網路稍有延遲**';
        statusDesc = '外部網關稍有波動，可能受 Discord 伺服器尖峰流量影響';
    } else if (effectiveLatency > 500 || wsPing < 0) {
        accentColor = Colors.Error;
        statusBadge = '🔴 **連線嚴重擁塞**';
        statusDesc = '檢測到通訊延遲顯著偏高，請確認主機網路與網關狀態';
    }

    const avatarUrl =
        bot.user?.displayAvatarURL?.({ extension: 'png', size: 128 }) ||
        'https://cdn.discordapp.com/embed/avatars/0.png';

    // 6 metrics neatly aligned into 3 pairs (4 lines total, perfectly matching 80px thumbnail)
    const metricsContent = [
        statusBadge,
        `📡 **網關心跳**：\`${wsFormatted}\` ｜ 🌐 **核心往返**：\`${roundtrip}ms\``,
        `⚡ **本機調度**：\`${execTime}ms\` ｜ 💾 **儲存讀寫**：\`${ioTime}ms\``,
        `🎵 **音訊節點**：\`${lavalink.status}\` ｜ 🤖 **AI 引擎**：\`${effectiveAI.status}\``
    ].join('\n');

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        // 1. Top Level 1 Heading
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ⚡ 核心系統全鏈路診斷'))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // 2. Main Section: Left 6 stats (4 lines) + Right Avatar Thumbnail (80px)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(metricsContent))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
        )
        // 3. Subtext Divider & Timestamp
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# 🕒 測量完成於 <t:${measuredAtUnix}:T> (<t:${measuredAtUnix}:R>)  •  ${statusDesc}`
            )
        );

    // 4. Interactive Refresh Button Row
    const refreshButton = new ButtonBuilder()
        .setCustomId('refresh_ping')
        .setLabel('重新偵測')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);

    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(refreshButton));

    return container;
}

const command: Command = {
    data: new SlashCommandBuilder().setName('ping').setDescription('檢查核心系統全鏈路延遲'),
    category: 'general',
    helpText: '🔹 `/ping` - 查看機器人網關、回應、儲存、音訊與 AI 引擎全鏈路延遲，支援即時重新偵測',
    async execute(interaction: ChatInputCommandInteraction, bot: BotClient) {
        try {
            const startMeasure = performance.now();

            // Initial loading container
            const loadingContainer = new ContainerBuilder()
                .setAccentColor(Colors.Info)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('### 🔍 正在精確測量全鏈路延遲...'),
                    new TextDisplayBuilder().setContent('-# 正在採集網關、往返、儲存、音訊與 AI 服務指標')
                );

            await interaction.reply({
                components: [loadingContainer],
                flags: MessageFlags.IsComponentsV2 as any
            });

            // Concurrently fetch reply and probe subsystems
            const [sent, ioTime, lavalinkResult, aiEngineResult] = await Promise.all([
                interaction.fetchReply(),
                measureStorageLatency(bot),
                measureLavalinkLatency(bot),
                measureAIEngineLatency(bot)
            ]);

            let lastRoundtrip = Math.max(0, sent.createdTimestamp - interaction.createdTimestamp);
            let lastIoTime = ioTime;
            let lastLavalink = lavalinkResult;
            let lastAIEngine = aiEngineResult;
            let lastExecTime = Math.max(0.1, Number((performance.now() - startMeasure).toFixed(1)));
            let lastMeasuredAtUnix = Math.floor(Date.now() / 1000);

            const initialContainer = buildPingContainer(bot, {
                roundtrip: lastRoundtrip,
                wsPing: bot.ws.ping,
                execTime: lastExecTime,
                ioTime: lastIoTime,
                lavalink: lastLavalink,
                aiEngine: lastAIEngine,
                ollama: lastAIEngine,
                disabled: false,
                measuredAtUnix: lastMeasuredAtUnix
            });

            await interaction.editReply({
                components: [initialContainer],
                flags: MessageFlags.IsComponentsV2 as any
            });

            // If the reply supports component collectors (production Message), attach the refresh listener
            if (typeof sent.createMessageComponentCollector === 'function') {
                const collector = sent.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 60_000 // 60 seconds active window
                });

                collector.on('collect', async (i: ButtonInteraction) => {
                    try {
                        if (i.user.id !== interaction.user.id) {
                            await i.reply({
                                content: `${Emojis.Warning} 這個按鈕屬於發起指令的成員，請自行輸入 \`/ping\` 查看。`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }

                        if (i.customId === 'refresh_ping') {
                            const clickTime = Date.now();
                            const refreshStart = performance.now();
                            await i.deferUpdate();

                            const [newIoTime, newLavalink, newAIEngine] = await Promise.all([
                                measureStorageLatency(bot),
                                measureLavalinkLatency(bot),
                                measureAIEngineLatency(bot)
                            ]);

                            lastRoundtrip = Math.max(0, Date.now() - clickTime);
                            lastIoTime = newIoTime;
                            lastLavalink = newLavalink;
                            lastAIEngine = newAIEngine;
                            lastExecTime = Math.max(0.1, Number((performance.now() - refreshStart).toFixed(1)));
                            lastMeasuredAtUnix = Math.floor(Date.now() / 1000);

                            const updatedContainer = buildPingContainer(bot, {
                                roundtrip: lastRoundtrip,
                                wsPing: bot.ws.ping,
                                execTime: lastExecTime,
                                ioTime: lastIoTime,
                                lavalink: lastLavalink,
                                aiEngine: lastAIEngine,
                                ollama: lastAIEngine,
                                disabled: false,
                                measuredAtUnix: lastMeasuredAtUnix
                            });

                            await interaction.editReply({
                                components: [updatedContainer],
                                flags: MessageFlags.IsComponentsV2 as any
                            });
                        }
                    } catch (error: unknown) {
                        const errMsg = error instanceof Error ? error.message : String(error);
                        console.warn('[Ping] Button interaction failed:', errMsg);
                    }
                });

                collector.on('end', () => {
                    try {
                        const disabledContainer = buildPingContainer(bot, {
                            roundtrip: lastRoundtrip,
                            wsPing: bot.ws.ping,
                            execTime: lastExecTime,
                            ioTime: lastIoTime,
                            lavalink: lastLavalink,
                            aiEngine: lastAIEngine,
                            ollama: lastAIEngine,
                            disabled: true,
                            measuredAtUnix: lastMeasuredAtUnix
                        });

                        interaction
                            .editReply({
                                components: [disabledContainer],
                                flags: MessageFlags.IsComponentsV2 as any
                            })
                            .catch((e: unknown) => {
                                const errMsg = e instanceof Error ? e.message : String(e);
                                console.warn('[Ping] Ignored timeout edit error:', errMsg);
                            });
                    } catch {}
                });
            }
        } catch (err: any) {
            console.error('[Ping CMD]', err);
            await bot.sendError(interaction, '偵測失敗', '無法完成系統延遲偵測，請稍後再試。');
        }
    }
};

export default command;
