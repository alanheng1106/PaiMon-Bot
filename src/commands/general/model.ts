import {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ChatInputCommandInteraction,
    ButtonInteraction,
    StringSelectMenuInteraction,
    PermissionFlagsBits
} from 'discord.js';
import { Colors, Emojis, EmojiIds } from '../../config';
import type BotClient from '../../core/BotClient';
import type { Command } from '../../types';

import { getModelEmoji, getPlatformMeta } from '../../core/ai/AIErrorDiagnostic';
export { getModelEmoji, getPlatformMeta };

export function getModelSelectEmoji(id: string): string {
    const lower = id.toLowerCase();
    if (lower.includes('deepseek')) return EmojiIds.DeepSeek;
    if (lower.includes('gemini')) return EmojiIds.Gemini;
    if (lower.includes('gpt')) return EmojiIds.ChatGPT;
    if (lower.includes('qwen')) return EmojiIds.Qwen;
    if (lower.includes('grok')) return EmojiIds.Grok;
    if (lower.includes('kimi')) return '🌙';
    if (lower.includes('glm')) return '🪐';
    if (lower.includes('minimax')) return '🌟';
    return '🤖';
}

export const cleanModelName = (name: string) =>
    name
        .replace(/\s*\(Ollama.*?\)/i, '')
        .replace(/\s*\(VTC.*?\)/i, '')
        .replace(/\s*\(MeowAI.*?\)/i, '')
        .replace(/\s*\(開源.*?\)/i, '')
        .trim();

export const cleanModelDesc = (desc?: string) => {
    if (!desc) return '高效能運算節點';
    return desc
        .replace(/^VTC GenAI 運算網關 \((.*?)\)$/, '$1')
        .replace(/^VTC GenAI 運算網關/, '高效能運算節點')
        .replace(/^VTC GenAI \((.*?)\)$/, '$1')
        .replace(/^VTC GenAI/, '高效能運算節點');
};

export const DEFAULT_MODEL_OPTIONS = [
    {
        id: 'vtc-deepseek',
        name: 'DeepSeek-V4 Pro Thinking (VTC 網關)',
        description: '旗艦級長思維鏈深度推理思考大模型'
    },
    { id: 'vtc-gemini', name: 'Gemini 3.8 Flash (VTC 網關)', description: '極速即時多模態回應引擎' },
    { id: 'vtc-gpt', name: 'GPT-5.4 (VTC 網關)', description: '次世代旗艦全方位智慧模型' },
    { id: 'vtc-qwen', name: 'Qwen 3.7 Max (VTC 網關)', description: '旗艦長文本綜合大模型' },
    { id: 'meowai-grok-4.7', name: 'Grok 4.7 (MeowAI 旗艦)', description: 'xAI 最新世代旗艦對話與深度推理模型' },
    {
        id: 'meowai-gpt-6.1-sol',
        name: 'GPT-6.1 Sol (MeowAI 旗艦)',
        description: 'MeowAI 次世代超強多模態旗艦模型'
    },
    { id: 'ol-gpt-oss-120b', name: 'GPT-OSS 120B (開源)', description: '開源 120B 大規模全功能模型' }
];

export const modelCommandData = new SlashCommandBuilder()
    .setName('model')
    .setDescription('開啟 AI 跨平台模型調度中心 (查看狀態、可用模型矩陣、切換引擎與即時測速)');

/**
 * Builds the unified Components V2 Dashboard Container for /model
 */
export function buildModelDashboardContainer(
    bot: BotClient,
    guildId: string | null = null,
    testResult: { latency: number; ok: boolean; error?: string } | null = null,
    isGlobal: boolean = false,
    disabled: boolean = false
): ContainerBuilder {
    const activeEntry = bot.ai.getActiveModel(isGlobal ? null : guildId);
    const models = bot.ai.getModelList(isGlobal ? null : guildId);

    // Accent Color based on test or operational status
    let accentColor: number;
    let pingString: string;

    if (testResult) {
        if (!testResult.ok) {
            accentColor = Colors.Error;
            pingString = `🔴 連線失敗 (${testResult.error || '無法連線'})`;
        } else if (testResult.latency > 1500) {
            accentColor = Colors.Warning;
            pingString = `🟡 ${testResult.latency}ms (延遲偏高)`;
        } else {
            accentColor = Colors.Success;
            pingString = `🟢 ${testResult.latency}ms (連線極佳)`;
        }
    } else if (activeEntry.provider.ready) {
        accentColor = Colors.Success;
        pingString = '🟢 節點就緒';
    } else {
        accentColor = Colors.Warning;
        pingString = '🟡 尚未就緒 (請檢查金鑰/端點)';
    }

    const platformMeta = getPlatformMeta(activeEntry.providerKey);
    const platformName = platformMeta.name;
    const platformEmoji = platformMeta.emoji;

    const scopeBadge = isGlobal ? '🌐 全域預設 (Global)' : '🏰 本伺服器 (Server Local)';

    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        // ─── 1. Header ──────────────────────────────────────────
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🤖 AI 跨平台模型調度中心'))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        // ─── 2. Section 1: 當前運行節點 ─────────────────────────
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    '### 🟢 當前運行節點',
                    `**啟用模型**：${getModelEmoji(activeEntry.id)} \`${activeEntry.name}\``,
                    `**底層代號**：\`${activeEntry.model}\`  •  **運算平台**：${platformEmoji} \`${platformName}\``,
                    `**連線狀態**：\`${pingString}\`  •  **生效範圍**：\`${scopeBadge}\``,
                    `**特點說明**：${cleanModelDesc(activeEntry.description)}`
                ].join('\n')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

    // ─── 3. Section 2: 跨平台模型矩陣 ───────────────────────────
    const activeId = activeEntry.id;
    const matrixSections: string[] = [];

    const platforms = [
        { key: 'vtc', title: `### ${Emojis.VTC} VTC GenAI` },
        { key: 'meowai', title: `### ${Emojis.MeowAI} MeowAI` },
        { key: 'lmstudio', title: `### ${Emojis.Ollama} Ollama / LM Studio` }
    ];

    for (const p of platforms) {
        const pModels = models.filter((m) => m.providerKey === p.key);
        if (pModels.length > 0) {
            if (matrixSections.length > 0) matrixSections.push('');
            matrixSections.push(p.title);
            for (const m of pModels) {
                const isCur = m.id === activeId;
                const statusTag = isCur ? ' `[當前啟用]`' : '';
                const bullet = isCur ? '🔹' : '▫️';
                const emoji = getModelEmoji(m.id);
                matrixSections.push(
                    `${bullet} ${emoji} **${cleanModelName(m.name)}** (\`${m.id}\`)${statusTag} — ${cleanModelDesc(m.description)}`
                );
            }
        }
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(matrixSections.join('\n')));

    // ─── 4. Action Buttons (All buttons embedded inside container) ─────
    const buttonRow = buildModelButtonRow(isGlobal, disabled);
    container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true))
        .addActionRowComponents(buttonRow);

    return container;
}

/**
 * Builds the interactive Select Menu ActionRow
 */
export function buildModelSelectMenu(
    activeId: string,
    disabled: boolean = false,
    modelList?: Array<{ id: string; name: string; description?: string }>
): ActionRowBuilder<StringSelectMenuBuilder> {
    const menu = new StringSelectMenuBuilder()
        .setCustomId('model_select_menu')
        .setPlaceholder('點擊選擇欲切換的 AI 模型引擎...')
        .setDisabled(disabled);

    const sourceList = modelList && modelList.length > 0 ? modelList : DEFAULT_MODEL_OPTIONS;

    const options = sourceList.map((m) => {
        const option = new StringSelectMenuOptionBuilder()
            .setLabel(cleanModelName(m.name).slice(0, 100))
            .setValue(m.id)
            .setDescription(cleanModelDesc(m.description).slice(0, 100))
            .setDefault(activeId === m.id);

        const emoji = getModelSelectEmoji(m.id);
        if (emoji) {
            option.setEmoji(emoji);
        }
        return option;
    });

    menu.addOptions(options);
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

/**
 * Builds the interactive Buttons ActionRow
 */
export function buildModelButtonRow(isGlobal: boolean, disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
    const pingBtn = new ButtonBuilder()
        .setCustomId('model_btn_ping')
        .setLabel('⚡ 立即測速')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled);

    const scopeBtn = new ButtonBuilder()
        .setCustomId('model_btn_scope')
        .setLabel(isGlobal ? '🌐 全域預設' : '🏰 本伺服器')
        .setStyle(isGlobal ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(disabled);

    const refreshBtn = new ButtonBuilder()
        .setCustomId('model_btn_refresh')
        .setLabel('🔄 重新整理')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(pingBtn, scopeBtn, refreshBtn);
}

const modelCommand: Command = {
    data: modelCommandData,
    category: 'general',
    cooldown: 2,
    helpText: '`/model` — 開啟 AI 跨平台模型調度中心（含可視化卡片、下拉切換與即時測速）',

    async execute(interaction: ChatInputCommandInteraction, bot: BotClient): Promise<any> {
        if (!bot.ai) {
            return await bot.sendError(interaction, '系統錯誤', 'AI 核心服務尚未載入。');
        }

        const guildId = interaction.guildId;
        let isGlobal = !guildId;
        let testResult: { latency: number; ok: boolean; error?: string } | null = null;

        const models = bot.ai.getModelList(isGlobal ? null : guildId);
        let activeId = bot.ai.getActiveModel(isGlobal ? null : guildId).id;
        let dashboardContainer = buildModelDashboardContainer(bot, guildId, testResult, isGlobal, false);
        let menuRow = buildModelSelectMenu(activeId, false, models);

        await interaction.reply({
            components: [dashboardContainer, menuRow],
            flags: MessageFlags.IsComponentsV2
        });

        const response = await interaction.fetchReply();
        const collector = response.createMessageComponentCollector({
            time: 120_000 // 2 minutes interactive lifetime
        });

        collector.on('collect', async (i: ButtonInteraction | StringSelectMenuInteraction) => {
            try {
                const isOwner = Boolean(
                    process.env.OWNER_ID &&
                    process.env.OWNER_ID.split(',').map((id: string) => id.trim()).includes(i.user.id)
                );

                if (i.user.id !== interaction.user.id && !isOwner) {
                    await i.reply({
                        content: `${Emojis.Warning} 這個控制面板不是你的哦！請自己輸入 \`/model\` 來開啟專屬面板。`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // ─── 1. Select Menu: 切換模型 ───────────────────
                if (i.isStringSelectMenu() && i.customId === 'model_select_menu') {
                    const selectedModel = i.values[0];

                    // Permission check: bot owner always bypasses server admin checks
                    if (isGlobal && guildId) {
                        const isAdmin = i.memberPermissions?.has(PermissionFlagsBits.Administrator);
                        if (!isOwner && !isAdmin) {
                            await i.reply({
                                content: `${Emojis.Warning} 只有伺服器管理員或機器人擁有者才能設定全域預設模型。`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }
                    } else if (guildId) {
                        const canManage =
                            isOwner ||
                            i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
                            i.memberPermissions?.has(PermissionFlagsBits.Administrator);
                        if (!canManage) {
                            await i.reply({
                                content: `${Emojis.Warning} 需具有「管理伺服器」權限或為機器人擁有者才能變更此伺服器的 AI 模型。`,
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }
                    }

                    bot.ai.switchModel(selectedModel, isGlobal ? null : guildId);
                    activeId = selectedModel;
                    testResult = null; // reset test on switch
                }

                // ─── 2. Button: 立即測速 ────────────────────────
                else if (i.isButton() && i.customId === 'model_btn_ping') {
                    await i.deferUpdate();
                    const currentModelId = bot.ai.getActiveModel(isGlobal ? null : guildId).id;
                    testResult = await bot.ai.testModel(currentModelId);
                }

                // ─── 3. Button: 切換生效範圍 (全域 / 本伺服器) ───
                else if (i.isButton() && i.customId === 'model_btn_scope') {
                    if (!guildId) {
                        await i.reply({
                            content: 'ℹ️ 私訊 (DM) 環境下始終為全域預設設定。',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    const isAdmin = i.memberPermissions?.has(PermissionFlagsBits.Administrator);
                    if (!isOwner && !isAdmin) {
                        await i.reply({
                            content: `${Emojis.Warning} 只有伺服器管理員或機器人擁有者才能切換至全域預設範圍。`,
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    isGlobal = !isGlobal;
                    activeId = bot.ai.getActiveModel(isGlobal ? null : guildId).id;
                }

                // ─── 4. Button: 重新整理 ────────────────────────
                else if (i.isButton() && i.customId === 'model_btn_refresh') {
                    activeId = bot.ai.getActiveModel(isGlobal ? null : guildId).id;
                    testResult = null;
                }

                const currentModels = bot.ai.getModelList(isGlobal ? null : guildId);
                dashboardContainer = buildModelDashboardContainer(bot, guildId, testResult, isGlobal, false);
                menuRow = buildModelSelectMenu(activeId, false, currentModels);

                if (i.deferred) {
                    await i.editReply({
                        components: [dashboardContainer, menuRow],
                        flags: MessageFlags.IsComponentsV2
                    });
                } else {
                    await i.update({
                        components: [dashboardContainer, menuRow],
                        flags: MessageFlags.IsComponentsV2
                    });
                }
            } catch (err: any) {
                console.warn('[Model CMD] Collector error:', err.message);
            }
        });

        collector.on('end', () => {
            const finalModels = bot.ai.getModelList(isGlobal ? null : guildId);
            const disabledContainer = buildModelDashboardContainer(bot, guildId, testResult, isGlobal, true);
            const disabledMenu = buildModelSelectMenu(activeId, true, finalModels);

            interaction
                .editReply({
                    components: [disabledContainer, disabledMenu],
                    flags: MessageFlags.IsComponentsV2
                })
                .catch(() => {});
        });
    }
};

export default modelCommand;
