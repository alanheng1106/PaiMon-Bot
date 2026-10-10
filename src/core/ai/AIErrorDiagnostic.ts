import { Emojis } from '../../config';

export type AIErrorCategory =
    'moderation' | 'rate_limit' | 'context_length' | 'timeout' | 'auth' | 'server_error' | 'network' | 'unknown';

export interface AIDiagnosisResult {
    category: AIErrorCategory;
    title: string;
    description: string;
    suggestions: string[];
    rawMessage: string;
}

export interface FormatAIErrorOptions {
    error: any;
    modelId?: string;
    modelName?: string;
    providerKey?: string;
}

/**
 * Returns the matching custom emoji for a given model ID.
 */
export function getModelEmoji(id: string = ''): string {
    const lower = id.toLowerCase();
    if (lower.includes('deepseek')) return Emojis.DeepSeek;
    if (lower.includes('gemini')) return Emojis.Gemini;
    if (lower.includes('gpt')) return Emojis.ChatGPT;
    if (lower.includes('qwen')) return Emojis.Qwen;
    if (lower.includes('grok')) return Emojis.Grok;
    if (lower.includes('kimi')) return '🌙';
    if (lower.includes('glm')) return '🪐';
    if (lower.includes('minimax')) return '🌟';
    return '🤖';
}

/**
 * Resolves clean display brand for an AI model provider (e.g. MeowAI, VTC, Ollama).
 */
export function getProviderBrand(activeModel?: { id?: string; name?: string; providerKey?: string } | null): string {
    if (!activeModel) return 'AI';
    const key = (activeModel.providerKey || '').toLowerCase();
    if (key === 'meowai') return 'MeowAI';
    if (key === 'vtc') return 'VTC';
    if (key === 'ollama' || key === 'lmstudio') return 'Ollama';

    const id = (activeModel.id || '').toLowerCase();
    if (id.includes('meowai')) return 'MeowAI';
    if (id.includes('vtc')) return 'VTC';
    if (id.includes('ol-') || id.includes('ollama')) return 'Ollama';

    const name = (activeModel.name || '').toLowerCase();
    if (name.includes('meowai')) return 'MeowAI';
    if (name.includes('vtc')) return 'VTC';
    if (name.includes('ollama') || name.includes('開源')) return 'Ollama';

    return 'Cloud';
}

/**
 * Strips provider and channel brackets from model name.
 */
export function cleanModelName(name: string = ''): string {
    return (
        name
            .replace(
                /\s*\([^)]*(?:Ollama|VTC|MeowAI|開源|Custom|社群|網關|旗艦|深度推理|通用智慧|旗艦長文本)[^)]*\)/gi,
                ''
            )
            .trim() ||
        name ||
        'AI'
    );
}

/**
 * Formats Scheme B Discord subtext footer badge: -# {emoji}  •  {model}  •  {provider}
 */
export function formatModelFooter(activeModel?: { id?: string; name?: string; providerKey?: string } | null): string {
    if (!activeModel) return '-# 🤖  •  AI  •  Cloud';
    const emoji = getModelEmoji(activeModel.id || '');
    const model = cleanModelName(activeModel.name || activeModel.id || 'AI');
    const provider = getProviderBrand(activeModel);
    return `-# ${emoji}  •  ${model}  •  ${provider}`;
}

/**
 * Returns platform name and emoji for a provider key.
 */
export function getPlatformMeta(providerKey: string = ''): { name: string; emoji: string } {
    switch (providerKey.toLowerCase()) {
        case 'ollama':
            return { name: 'Ollama', emoji: Emojis.Ollama };
        case 'meowai':
            return { name: 'MeowAI', emoji: Emojis.MeowAI };
        case 'lmstudio':
            return { name: 'Ollama / LM Studio', emoji: Emojis.Ollama };
        case 'vtc':
        default:
            return { name: 'VTC GenAI', emoji: Emojis.VTC };
    }
}

/**
 * AIErrorDiagnostic — Analyzes AI inference and upstream errors, provides transparent
 * plain-language diagnostics, extracts raw root causes, and generates actionable advice for users.
 * Follows Single Responsibility Principle (SRP).
 */
export class AIErrorDiagnostic {
    /**
     * Extracts and normalizes the raw error message string from an error object.
     */
    static extractRawMessage(error: any): string {
        if (!error) return '未知的錯誤';

        let msg: string;
        if (typeof error === 'string') {
            msg = error;
        } else if (error.message) {
            msg = String(error.message);
        } else if (error.cause?.message) {
            msg = String(error.cause.message);
        } else {
            msg = String(error);
        }

        // Clean redundant internal wrapper prefixes for cleaner user readability
        msg = msg.replace(/^無法連線至 AI 模型伺服器 \[.*?\]:\s*/i, '');
        msg = msg.replace(/^\[OpenAICompatibleProvider\] API Error \(.*?\):\s*/i, '');

        // If the error message embeds a JSON payload (e.g. Cloudflare 502 / API error JSON)
        const jsonMatch = msg.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.detail && parsed.title) {
                    msg = `${parsed.title}: ${parsed.detail}`;
                } else if (parsed.error?.message) {
                    msg = String(parsed.error.message);
                } else if (parsed.message) {
                    msg = String(parsed.message);
                }
            } catch {
                // Ignore parse failures and retain raw string
            }
        }

        // Escape triple backticks to prevent breaking markdown formatting
        msg = msg.replace(/```/g, "'''").trim();

        // Truncate overly long error dumps (safety cap at 450 characters)
        if (msg.length > 450) {
            msg = `${msg.slice(0, 447)}...`;
        }

        return msg || '未提供具體錯誤詳情';
    }

    /**
     * Analyzes error text and classifies it into an actionable diagnostic result.
     */
    static diagnose(error: any): AIDiagnosisResult {
        const rawMessage = this.extractRawMessage(error);
        const fullSearchText =
            `${rawMessage} ${error?.status || ''} ${error?.code || ''} ${error?.cause?.message || ''}`.toLowerCase();

        // 1. Content Moderation / Safety Filter (Highest specificity)
        if (
            /inappropriate content|datainspectionfailed|content_filter|safety policy|safety guidelines|inappropriate|違規|涉嫌違規|內容合規|风控|風控|sensitive content/i.test(
                fullSearchText
            )
        ) {
            return {
                category: 'moderation',
                title: '🛑 內容安全審核攔截 (Content Moderation)',
                description:
                    '輸入內容、對話上下文歷史或網頁搜尋資料觸發了上游運算平台的文本安全審核機制（例如阿里雲百煉／通義千問的合規過濾系統）。',
                suggestions: [
                    '請嘗試調整提問詞彙或避開敏感關鍵字。',
                    '使用 `/model` 切換至其他審核標準不同的模型（如 Gemini 3.8 Flash、GPT-5.4、Grok 4.7）。',
                    '若先前對話曾討論過爭議主題，建議更換頻道或稍後重試以開啟全新對話。'
                ],
                rawMessage
            };
        }

        // 2. Rate Limit / Quota Exhaustion
        if (
            /429|rate[- ]?limit|too many requests|quota exceeded|exceeded.*quota|resource_exhausted|頻率超限|請求過於頻繁/i.test(
                fullSearchText
            )
        ) {
            return {
                category: 'rate_limit',
                title: '⏱️ 請求頻率超限 / 額度暫時耗盡 (429 Rate Limit)',
                description: '向該 AI 運算節點發送的請求過於頻繁，或當前 API 調用額度已達上限。',
                suggestions: ['請稍候 10~30 秒後再次嘗試發問。', '使用 `/model` 切換至其他運算節點繼續對話。'],
                rawMessage
            };
        }

        // 3. Context Length Limit Exceeded
        if (
            /maximum context length|context length|token limit|max_tokens|prompt is too long|context window/i.test(
                fullSearchText
            )
        ) {
            return {
                category: 'context_length',
                title: '📜 對話上下文長度超限 (Context Limit Exceeded)',
                description: '本頻道累積的歷史對話長度已超出該模型單次支援的最大 Token 運算上限。',
                suggestions: [
                    '建議更換頻道或等待對話記憶逾時以建立全新話題。',
                    '使用 `/model` 切換至支援超長上下文的模型（如 Qwen 3.7 Max 或 Gemini 3.8 Flash）。'
                ],
                rawMessage
            };
        }

        // 4. Authentication / Permission Error
        if (
            /401|403|unauthorized|forbidden|invalid.*(?:api[ _]?key|token)|authentication failed|permission denied|金鑰無效/i.test(
                fullSearchText
            )
        ) {
            return {
                category: 'auth',
                title: '🔑 API 金鑰驗證失敗 (401/403 Unauthorized)',
                description: 'AI 運算節點伺服器拒絕了請求，可能金鑰無效、已過期或缺乏存取權限。',
                suggestions: [
                    '請聯繫機器人管理員檢查後台 API Key 與連線設定。',
                    '使用 `/model` 切換至其他正常運行的模型。'
                ],
                rawMessage
            };
        }

        // 5. Connection Timeout
        if (/timeout|timed out|etimedout|abortsignal\.timeout|連線逾時/i.test(fullSearchText)) {
            return {
                category: 'timeout',
                title: '⏳ 網路連線等待逾時 (Connection Timeout)',
                description: '模型運算時間過長或網路通訊延遲，超過了系統允許的最大等待時限。',
                suggestions: [
                    '請嘗試簡化問題長度或稍候再試。',
                    '可輸入 `/model` 點擊「⚡ 立即測速」檢查各節點連線延遲。'
                ],
                rawMessage
            };
        }

        // 6. Upstream / Gateway Server Error (5xx or Premature Disconnect)
        if (
            /500|502|503|504|internal server error|bad gateway|service unavailable|gateway timeout|vtc 500|origin_bad_gateway|ended the reply early|reply is incomplete|incomplete response/i.test(
                fullSearchText
            )
        ) {
            return {
                category: 'server_error',
                title: '🖥️ 運算伺服器異常 / 服務中斷 (Server / Gateway Error)',
                description:
                    'AI 運算伺服器內部發生未預期錯誤、回傳流中途截斷、或由 Cloudflare 偵測到源端伺服器過載中斷 (502 Bad Gateway)。',
                suggestions: [
                    '上游伺服器可能正在重啟、維護或處於高負載，請稍候重試。',
                    '使用 `/model` 切換至其他在線模型引擎（如 Gemini 3.8 或 GPT-5.4）。'
                ],
                rawMessage
            };
        }

        // 7. Network Unreachable
        if (/econnrefused|enotfound|fetch failed|network error|無法連線/i.test(fullSearchText)) {
            return {
                category: 'network',
                title: '🌐 網路通訊連線失敗 (Network Error)',
                description: '無法連線至 AI 運算網關或模型主機，主機可能離線或網路通訊中斷。',
                suggestions: ['請確認運算伺服器或網關是否處於開機在線狀態。', '使用 `/model` 切換至其他可用模型。'],
                rawMessage
            };
        }

        // 8. General Unknown Error
        return {
            category: 'unknown',
            title: '⚙️ AI 運算處理異常 (Inference Error)',
            description: '模型在推理或生成回覆過程中發生未預期的異常狀況。',
            suggestions: ['請嘗試重新發送訊息，或稍候再試。', '若持續發生，請使用 `/model` 切換至其他模型。'],
            rawMessage
        };
    }

    /**
     * Formats a complete, user-facing transparent error report in Discord Markdown.
     */
    static formatErrorMessage(options: FormatAIErrorOptions): string {
        const { error, modelId = '', modelName = '', providerKey = '' } = options;
        const diagnosis = this.diagnose(error);

        // Resolve Model & Platform Information
        const modelEmoji = getModelEmoji(modelId);
        const cleanName =
            modelName
                .replace(/\s*\(Ollama.*?\)/i, '')
                .replace(/\s*\(VTC.*?\)/i, '')
                .trim() || 'AI 運算模型';

        const platformMeta = getPlatformMeta(providerKey);
        const platformName = platformMeta.name;
        const platformEmoji = platformMeta.emoji;

        const suggestionList = diagnosis.suggestions.map((s) => `• ${s}`).join('\n');

        return [
            `### ${Emojis.Warning} AI 運算節點回報異常`,
            `**當前模型**：${modelEmoji} \`${cleanName}\`  •  **運算平台**：${platformEmoji} \`${platformName}\``,
            `**狀況診斷**：${diagnosis.title}`,
            `> ${diagnosis.description}`,
            '',
            '**底層原始回報**：',
            '```',
            diagnosis.rawMessage,
            '```',
            '',
            '💡 **建議處理方式**：',
            suggestionList
        ].join('\n');
    }
}

export default AIErrorDiagnostic;
