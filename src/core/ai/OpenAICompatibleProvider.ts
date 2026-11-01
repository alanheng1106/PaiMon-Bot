import OpenAI from 'openai';
import ILLMProvider, { ChatStreamParams, ChatStreamChunk } from './ILLMProvider';
import { AI as AIConfig } from '../../config';

export interface OpenAICompatibleProviderOptions {
    client?: OpenAI | null;
    baseURL?: string;
    apiKey?: string;
    name?: string;
}

/**
 * OpenAICompatibleProvider — Strategy implementation for OpenAI-compatible APIs.
 * Supports:
 * - Windowsed GenAI Gateway & OpenAI-compatible servers (vLLM, LiteLLM, OneAPI)
 * - Official OpenAI API or any proxy following OpenAI REST / SSE conventions
 * - Multi-turn conversation, Tool/Function Calling streaming, and Reasoning/Thinking streaming (DeepSeek-R1 style)
 */
class OpenAICompatibleProvider extends ILLMProvider {
    #client: OpenAI | null = null;
    #baseURL: string = '';
    #apiKey: string = '';
    #name: string = 'OpenAI-Compatible';

    constructor(options: OpenAICompatibleProviderOptions = {}) {
        super();
        if (options.client) {
            this.#client = options.client;
            this.#baseURL = options.baseURL || (this.#client as any).baseURL || '';
            this.#apiKey = options.apiKey || (this.#client as any).apiKey || '';
            this.#name = options.name || 'Custom-OpenAI';
        } else {
            const rawBaseURL =
                options.baseURL !== undefined
                    ? options.baseURL
                    : AIConfig?.WindowsedAIBaseUrl || '';

            const rawApiKey = options.apiKey || AIConfig?.WindowsedAIApiKey || 'sk-api-token';

            this.#name = options.name || AIConfig?.WindowsedAIName || 'VTC GenAI';

            if (rawBaseURL) {
                // Ensure baseURL doesn't have trailing slash for consistency
                this.#baseURL = rawBaseURL.replace(/\/+$/, '');
                this.#apiKey = rawApiKey;

                try {
                    this.#client = new OpenAI({
                        baseURL: this.#baseURL,
                        apiKey: this.#apiKey,
                        timeout: 180000,
                        maxRetries: 2
                    });
                } catch (err: any) {
                    console.error('[OpenAICompatibleProvider] Failed to create OpenAI client:', err.message);
                    this.#client = null;
                }
            } else {
                this.#client = null;
            }
        }
    }

    override get ready(): boolean {
        return Boolean(this.#client && this.#baseURL);
    }

    get baseURL(): string {
        return this.#baseURL;
    }

    get name(): string {
        return this.#name;
    }

    get client(): OpenAI | null {
        return this.#client;
    }

    /**
     * Measures latency and checks connectivity with the backend host.
     */
    async testConnection(timeoutMs: number = 3000): Promise<{ ok: boolean; latency: number; error?: string }> {
        if (!this.#baseURL) {
            return { ok: false, latency: -1, error: '未設定 API Base URL' };
        }

        const start = performance.now();
        try {
            // First attempt: GET /models endpoint with timeout
            const modelsUrl = `${this.#baseURL}/models`;
            const res = await fetch(modelsUrl, {
                headers: this.#apiKey ? { Authorization: `Bearer ${this.#apiKey}` } : {},
                signal: AbortSignal.timeout(timeoutMs)
            });

            const latency = Math.max(0.1, Number((performance.now() - start).toFixed(1)));
            if (res.ok || res.status === 401 || res.status === 403) {
                // If 401/403, host is reachable even if key is needed
                return {
                    ok: res.ok,
                    latency,
                    error: res.ok ? undefined : `HTTP ${res.status}: 驗證未通過，請檢查 API Key`
                };
            }

            // Fallback: ping baseURL directly
            return { ok: false, latency, error: `HTTP ${res.status}: ${res.statusText}` };
        } catch (err: any) {
            const latency = Number((performance.now() - start).toFixed(1));
            return {
                ok: false,
                latency: latency > timeoutMs ? -1 : latency,
                error: err.name === 'TimeoutError' ? '連線逾時 (請確認 API 網關伺服器是否在線)' : err.message
            };
        }
    }

    /**
     * Formats incoming messages to ensure full compatibility with OpenAI API standard:
     * - Converts image attachments to OpenAI's `{ type: 'image_url', image_url: { url } }` format
     * - Ensures tool result messages carry `tool_call_id`
     */
    formatMessages(messages: any[]): any[] {
        return messages
            .filter((msg) => msg && typeof msg === 'object')
            .map((msg) => {
                const formatted: any = { role: msg.role || 'user' };

                // User messages with multimodal images or text
                if (msg.role === 'user') {
                    if (Array.isArray(msg.images) && msg.images.length > 0) {
                        const contentParts: any[] = [];
                        // Google Gemini strictly requires at least one non-empty text prompt alongside images
                        const textContent =
                            msg.content && String(msg.content).trim()
                                ? String(msg.content).trim()
                                : '請查看並分析此圖片。';
                        contentParts.push({ type: 'text', text: textContent });

                        for (const img of msg.images) {
                            if (!img) continue;
                            const dataUrl = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
                            contentParts.push({
                                type: 'image_url',
                                image_url: { url: dataUrl }
                            });
                        }
                        formatted.content = contentParts;
                    } else {
                        // Prevent empty string or whitespace-only messages from breaking Gemini API
                        const textContent =
                            msg.content && String(msg.content).trim() ? String(msg.content).trim() : '你好';
                        formatted.content = textContent;
                    }
                } else if (msg.role === 'tool') {
                    const toolText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                    formatted.content = toolText && toolText.trim() ? toolText : '{"status":"ok"}';
                    formatted.tool_call_id = msg.tool_call_id || msg.id || 'tool_call_id';
                    if (msg.name) formatted.name = msg.name;
                } else if (msg.role === 'assistant') {
                    if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
                        formatted.tool_calls = msg.tool_calls;
                        formatted.content =
                            msg.content && String(msg.content).trim() ? String(msg.content).trim() : null;
                    } else {
                        formatted.content =
                            msg.content && String(msg.content).trim() ? String(msg.content).trim() : '...';
                    }
                } else {
                    // System or other roles
                    formatted.content =
                        msg.content && String(msg.content).trim()
                            ? String(msg.content).trim()
                            : 'You are a helpful assistant.';
                }

                return formatted;
            });
    }

    override async *chatStream({
        model,
        messages,
        tools,
        tool_choice,
        options
    }: ChatStreamParams): AsyncGenerator<ChatStreamChunk> {
        if (!this.#client) {
            throw new Error(`[OpenAICompatibleProvider] Client 未初始化。請先設定 API Base URL (${this.#name})。`);
        }

        const formattedMessages = this.formatMessages(messages);

        const requestPayload: any = {
            model,
            messages: formattedMessages,
            stream: true,
            temperature: options?.temperature ?? AIConfig?.Temperature ?? 0.7,
            top_p: options?.top_p ?? AIConfig?.TopP ?? 0.95
        };

        if (tools && tools.length > 0) {
            requestPayload.tools = tools;
            if (tool_choice) {
                requestPayload.tool_choice = tool_choice;
            }
        }

        let stream: any;
        try {
            stream = await this.#client.chat.completions.create(requestPayload);
        } catch (error: any) {
            // Graceful fallback: If gateway rejects forced tool_choice, retry with tool_choice removed
            if (requestPayload.tool_choice && error.message?.toLowerCase().includes('tool_choice')) {
                delete requestPayload.tool_choice;
                stream = await this.#client.chat.completions.create(requestPayload);
            } else {
                console.error(`[OpenAICompatibleProvider] API Error (${this.#baseURL}):`, error.message);
                throw new Error(`無法連線至 AI 模型伺服器 [${this.#name}]: ${error.message}`, { cause: error });
            }
        }

        // Accumulator map for assembling streaming tool_calls chunks: index -> tool_call
        const accumulatedToolCalls = new Map<number, any>();

        for await (const chunk of stream) {
            const choice = chunk.choices?.[0];
            const delta = choice?.delta;

            if (!delta) continue;

            const contentPiece = delta.content || '';

            // Handle reasoning/thinking tokens (e.g. DeepSeek-R1 / vLLM reasoning_content)
            const thinkingPiece =
                (delta as any).reasoning_content || (delta as any).reasoning || (delta as any).thinking || '';

            // Accumulate streaming tool call deltas
            let hasToolCalls = false;
            if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
                hasToolCalls = true;
                for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!accumulatedToolCalls.has(idx)) {
                        accumulatedToolCalls.set(idx, {
                            id: tc.id || `call_${idx}_${Date.now()}`,
                            type: tc.type || 'function',
                            function: {
                                name: tc.function?.name || '',
                                arguments: tc.function?.arguments || ''
                            }
                        });
                    } else {
                        const existing = accumulatedToolCalls.get(idx);
                        if (tc.id) existing.id = tc.id;
                        if (tc.function?.name) existing.function.name += tc.function.name;
                        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                    }
                }
            }

            yield {
                content: contentPiece,
                thinking: thinkingPiece,
                toolCalls:
                    hasToolCalls || accumulatedToolCalls.size > 0 ? Array.from(accumulatedToolCalls.values()) : null
            };
        }
    }
}

export default OpenAICompatibleProvider;
