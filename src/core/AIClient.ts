import { AI as AIConfig, Emojis } from '../config';
import ILLMProvider from './ai/ILLMProvider';
import OpenAICompatibleProvider from './ai/OpenAICompatibleProvider';
import DiscordSanitizer from '../utils/DiscordSanitizer';
import type ImageSynthesisService from './ai/ImageSynthesisService';
import type ToolRegistry from './tools/ToolRegistry';
import type AIChatSessionManager from './ai/AIChatSessionManager';
import type { ToolDefinition } from './tools/BaseTool';
import type { AIChatMessage } from './ai/AIChatSessionManager';
import ModelRegistry, { ModelEntry, ModelStatusInfo } from './ai/ModelRegistry';
import type GuildSettings from './GuildSettings';
import type UserMemoryStore from './ai/UserMemoryStore';

export interface AIClientOptions {
    llmProvider?: ILLMProvider | null;
    imageService?: ImageSynthesisService | null;
    toolRegistry?: ToolRegistry | null;
    promptProvider?: any;
    sessionManager?: AIChatSessionManager | null;
    config?: typeof AIConfig;
    maxToolIterations?: number;
    model?: string;
    modelRegistry?: ModelRegistry | null;
    settings?: GuildSettings | null;
    userMemoryStore?: UserMemoryStore | null;
}

export interface AIResponseWithAttachments {
    text: string;
    attachments: { filename: string; content: string | Buffer }[];
}

/**
 * AIClient — Core AI service facade for LLM inference, tool execution, and context management.
 * Refactored for clean Strategy Pattern (ILLMProvider), Dependency Injection (DIP), and SRP.
 */
class AIClient {
    #llmProvider: ILLMProvider;
    #imageService: ImageSynthesisService | null;
    #toolRegistry: ToolRegistry;
    #sessionManager: AIChatSessionManager;
    #modelRegistry: ModelRegistry;
    #userMemoryStore: UserMemoryStore | null;
    #model: string;
    #maxToolIterations: number;

    constructor(options: AIClientOptions = {}) {
        const { llmProvider = null, imageService = null, toolRegistry = null, sessionManager = null } = options;

        this.#modelRegistry = options.modelRegistry || new ModelRegistry(options.settings || null);

        // Image Synthesis Service Init (Optional, disabled)
        this.#imageService = imageService || null;

        // LLM Provider Strategy Init (OCP / DIP)
        if (llmProvider instanceof ILLMProvider) {
            this.#llmProvider = llmProvider;
        } else {
            this.#llmProvider = new OpenAICompatibleProvider();
        }

        this.#model = options.model || process.env.VTC_AI_MODEL || 'deepseek-v4-pro-thinking';

        // Auto-register default model if registry is empty
        if (this.#modelRegistry.listModels().length === 0) {
            this.#modelRegistry.registerModel({
                id: 'vtc-deepseek',
                name: 'DeepSeek-V4 Pro Thinking (VTC 網關)',
                providerKey: 'vtc',
                model: this.#model,
                provider: this.#llmProvider,
                description: 'VTC GenAI (旗艦級長思維鏈深度推理)',
                isDefault: true
            });
        }

        // Session Manager Init (SRP / DIP)
        this.#sessionManager = sessionManager!;
        if (!this.#sessionManager) {
            throw new Error('[AIClient] sessionManager is required. Please inject it via the AppContainerBuilder.');
        }

        // ToolRegistry Init (DIP)
        this.#toolRegistry = toolRegistry!;
        if (!this.#toolRegistry) {
            throw new Error('[AIClient] toolRegistry is required. Please inject it via the AppContainerBuilder.');
        }

        this.#imageService = imageService;
        this.#userMemoryStore = options.userMemoryStore || null;
        this.#maxToolIterations =
            options.maxToolIterations ?? options.config?.MaxToolIterations ?? AIConfig?.MaxToolIterations ?? 5;
    }

    get userMemoryStore(): UserMemoryStore | null {
        return this.#userMemoryStore;
    }

    get modelRegistry(): ModelRegistry {
        return this.#modelRegistry;
    }

    get maxToolIterations(): number {
        return this.#maxToolIterations;
    }

    get model(): string {
        try {
            const active = this.#modelRegistry.resolveActiveModel();
            return active ? active.model : this.#model;
        } catch {
            return this.#model;
        }
    }

    get llmProvider(): ILLMProvider {
        try {
            const active = this.#modelRegistry.resolveActiveModel();
            return active ? active.provider : this.#llmProvider;
        } catch {
            return this.#llmProvider;
        }
    }

    get tools(): ToolDefinition[] {
        return this.#toolRegistry.getDefinitions();
    }

    get ready(): boolean {
        try {
            const active = this.#modelRegistry.resolveActiveModel();
            return active ? active.provider.ready : this.#llmProvider.ready;
        } catch {
            return this.#llmProvider.ready;
        }
    }

    get llmReady(): boolean {
        return this.ready;
    }

    get chats(): any {
        return this.#sessionManager.chats;
    }

    get sessionManager(): AIChatSessionManager {
        return this.#sessionManager;
    }

    get imageService(): ImageSynthesisService | null {
        return this.#imageService;
    }

    #ensureSession(channelId: string): AIChatMessage[] {
        return this.#sessionManager.ensureSession(channelId);
    }

    #pruneHistory(channelId: string): void {
        return this.#sessionManager.pruneHistory(channelId);
    }

    addPassiveContext(channelId: string, userName: string, text: string): void {
        return this.#sessionManager.addPassiveContext(channelId, userName, text);
    }

    /**
     * Clear / reset conversation history for a specific channel.
     */
    clearSession(channelId: string): boolean {
        return this.#sessionManager.clearSession(channelId);
    }

    async generateResponse(
        prompt: string,
        channelId: string = 'default',
        userName: string = '使用者',
        onUpdate: ((text: string) => Promise<void> | void) | null = null,
        images: string[] = [],
        options: {
            guildId?: string | null;
            modelId?: string | null;
            largeFileCache?: any;
            userId?: string | null;
        } = {}
    ): Promise<string | AIResponseWithAttachments> {
        const sessionHistory = this.#ensureSession(channelId);

        // Check if Thinking Mode should be activated for this interaction
        const isThinkingRequested =
            Boolean(AIConfig?.EnableThinking) ||
            Boolean(prompt && /(深度思考|深入思考|仔細思考|認真思考|\/think|think mode|think|思考|推理)/i.test(prompt));

        const userMessage: any = {
            role: 'user',
            content: prompt ? `[${userName}]: ${prompt}` : `[${userName}] 發送了一張圖片`
        };

        // Gemma 4 Modality Order: Images placed before text in prompt construction
        if (images && images.length > 0) {
            userMessage.images = images;
            if (prompt) {
                userMessage.content = `[附加 ${images.length} 張圖片]\n[${userName}]: ${prompt}`;
            }
        }

        sessionHistory.push(userMessage);
        this.#pruneHistory(channelId);

        const requestMessages = [...sessionHistory];

        // Inject Long-Term User Memories into System Prompt if available (from PaiMon's Notebook)
        if (options.userId && this.#userMemoryStore && requestMessages.length > 0 && requestMessages[0]?.role === 'system') {
            const memoryText = this.#userMemoryStore.formatMemoriesForPrompt(options.userId);
            if (memoryText) {
                const currentSystemPrompt = requestMessages[0].content || '';
                requestMessages[0] = {
                    ...requestMessages[0],
                    content: `${currentSystemPrompt}\n\n${memoryText}`
                };
            }
        }

        // Inject <|think|> trigger into system prompt if thinking mode is active
        if (isThinkingRequested && requestMessages.length > 0 && requestMessages[0]?.role === 'system') {
            const currentSystemPrompt = requestMessages[0].content || '';
            if (!currentSystemPrompt.startsWith('<|think|>')) {
                requestMessages[0] = {
                    ...requestMessages[0],
                    content: `<|think|>\n${currentSystemPrompt}`
                };
            }
        }

        // Check if visual image generation or image editing (魔改 / 圖生圖) is explicitly requested by user
        const isImageGenRequested =
            Boolean(this.#toolRegistry.has('generate_image')) &&
            Boolean(
                prompt &&
                (/(?:幫我|請|給我)?(?:畫|生成|繪製|做|搞|整|設計|出).*(?:張|幅|個)?(?:圖片|圖|畫面|插畫|插圖|相片|壁紙|照片|頭像|海報|桌布)/i.test(
                    prompt
                ) ||
                    /(?:幫我|請)?(?:畫|繪製|生圖|做圖|製圖|改圖|魔改|修圖|換風格|圖生圖)\b/i.test(prompt) ||
                    /(?:畫|繪製|魔改|修|改).*(?:一張|一幅|一個|這張|這幅|這個)/i.test(prompt) ||
                    /(?:生成|繪製|魔改).*(?:畫面|視覺|圖片|照片|插圖)/i.test(prompt) ||
                    /(?:把這張|將這張|拿這張).*(?:魔改|改|換|變)/i.test(prompt) ||
                    /(?:generate|create|draw|make|paint|edit|modify).*(?:image|picture|photo|painting|illustration|art|wallpaper)/i.test(
                        prompt
                    ))
            );

        // Resolve model & provider dynamically (guild override or active global)
        let activeProvider = this.#llmProvider;
        let activeModelName = this.#model;
        let activeEntry: any = null;

        try {
            const targetId = options.modelId || this.#modelRegistry.getActiveModelId(options.guildId);
            const entry =
                this.#modelRegistry.getModel(targetId) || this.#modelRegistry.resolveActiveModel(options.guildId);
            if (entry) {
                activeEntry = entry;
                activeProvider = entry.provider;
                activeModelName = entry.model;
            }
        } catch {
            activeProvider = this.#llmProvider;
            activeModelName = this.#model;
        }

        // Multimodal Vision Auto-Routing: If images are present and active model lacks vision, switch to vision model
        if (images && images.length > 0) {
            const lacksVision =
                activeEntry?.supportsVision === false ||
                activeModelName.toLowerCase().includes('deepseek') ||
                (activeEntry?.id || '').toLowerCase().includes('deepseek');

            if (lacksVision && typeof this.#modelRegistry.findVisionModel === 'function') {
                const visionModel = this.#modelRegistry.findVisionModel();
                if (visionModel) {
                    activeProvider = visionModel.provider;
                    activeModelName = visionModel.model;
                    console.log(
                        `[AIClient] Multimodal input detected: Auto-routed from text-only model to Vision model "${visionModel.name}" (${visionModel.model})`
                    );
                }
            }
        }

        try {
            let finalReplyText = '';
            const attachments: { filename: string; content: string | Buffer }[] = [];
            const maxIterations = this.#maxToolIterations;
            let iterations = 0;
            const executedToolCalls = new Map<string, string>();

            while (iterations < maxIterations) {
                iterations++;

                // When reaching the last allowed iteration, omit tools so model must synthesize final text
                const isFinalIteration = iterations === maxIterations;

                // Force generate_image tool choice on iteration 1 if user explicitly asked for drawing
                let toolChoice: any = undefined;
                if (!isFinalIteration && iterations === 1 && isImageGenRequested) {
                    toolChoice = { type: 'function', function: { name: 'generate_image' } };
                }

                const stream = activeProvider.chatStream({
                    model: activeModelName,
                    messages: requestMessages,
                    tools: isFinalIteration ? undefined : this.tools,
                    tool_choice: toolChoice,
                    think: isThinkingRequested,
                    options: {
                        temperature: AIConfig?.Temperature ?? 1.0,
                        top_p: AIConfig?.TopP ?? 0.95,
                        top_k: AIConfig?.TopK ?? 64,
                        num_ctx: AIConfig?.NumCtx ?? 32768
                    }
                });

                const { currentContent, toolCalls } = await this.#consumeStream(stream, onUpdate);

                if (!isFinalIteration && toolCalls && toolCalls.length > 0) {
                    await this.#executeToolCalls(toolCalls, requestMessages, {
                        currentContent,
                        executedToolCalls,
                        meta: {
                            onUpdate,
                            channelId,
                            userName,
                            userId: options.userId,
                            attachments,
                            largeFileCache: options.largeFileCache,
                            images
                        }
                    });
                } else {
                    // Safety Net: Catch unfulfilled promises to draw (e.g. model outputted "好呀，本派蒙這就幫你畫！" without invoking the tool)
                    const isDrawingPromise =
                        /(?:這就幫你畫|我這就畫|這就為你畫|這就畫給你|馬上畫|馬上幫你畫|現在就畫|這就畫|這就幫你生成|這就幫你魔改|這就幫你改|這就為你魔改)/i.test(
                            currentContent
                        );
                    if (
                        !isFinalIteration &&
                        attachments.length === 0 &&
                        this.#toolRegistry.has('generate_image') &&
                        (isImageGenRequested || isDrawingPromise)
                    ) {
                        const toolResult = await this.#toolRegistry.execute(
                            'generate_image',
                            { prompt },
                            { onUpdate, channelId, userName, attachments, images }
                        );

                        requestMessages.push({
                            role: 'assistant',
                            content: currentContent || '好嘞，本派蒙這就畫給你！'
                        });
                        requestMessages.push({
                            role: 'user',
                            content: `[系統通知]: generate_image 工具已執行完成並生成圖片：${toolResult}。請向使用者熱情介紹這張作品！`
                        });
                        continue;
                    }

                    const parsed = this.parseThinkingAndContent(currentContent);
                    const cleanAnswer = parsed.content || currentContent;
                    finalReplyText = DiscordSanitizer.sanitize(cleanAnswer);
                    if (finalReplyText) {
                        // Gemma 4 Best Practice: Never save thinking tokens or thought content into multi-turn session history
                        sessionHistory.push({ role: 'assistant', content: finalReplyText });
                    }
                    break;
                }
            }

            if (!finalReplyText) {
                if (attachments.length > 0) {
                    finalReplyText = '已完成相關工具操作並生成檔案。';
                    sessionHistory.push({ role: 'assistant', content: finalReplyText });
                } else {
                    console.warn(
                        `[AIClient] Reached maximum tool execution limit (${maxIterations} iterations) without final text.`
                    );
                    finalReplyText = '已完成相關工具操作，但未能生成後續總結回覆，請稍後再試。';
                    sessionHistory.push({ role: 'assistant', content: finalReplyText });
                }
            }

            if (attachments.length > 0) {
                return {
                    text: finalReplyText,
                    attachments
                };
            }

            return finalReplyText;
        } catch (error: any) {
            console.error('[AIClient] Inference Error:', error.message);
            // Concurrency-safe rollback: only remove the specific userMessage added in this turn
            const userMsgIdx = sessionHistory.indexOf(userMessage);
            if (userMsgIdx !== -1) {
                sessionHistory.splice(userMsgIdx, 1);
            }
            throw error;
        }
    }

    /**
     * Parses Gemma 4 thinking format (<|channel>thought...<channel|>) and standard <think>...</think> tags.
     */
    parseThinkingAndContent(rawText: string): { thinking: string; content: string; isThinking: boolean } {
        if (!rawText) return { thinking: '', content: '', isThinking: false };

        // 1. Gemma 4 native thinking tags
        const gemmaStart = '<|channel>thought';
        const gemmaEnd = '<channel|>';

        if (rawText.includes(gemmaStart)) {
            const startIndex = rawText.indexOf(gemmaStart) + gemmaStart.length;
            const endIndex = rawText.indexOf(gemmaEnd, startIndex);

            if (endIndex !== -1) {
                const thinking = rawText.slice(startIndex, endIndex).trim();
                const content = rawText.slice(endIndex + gemmaEnd.length).trim();
                return { thinking, content, isThinking: false };
            } else {
                const thinking = rawText.slice(startIndex).trim();
                return { thinking, content: '', isThinking: true };
            }
        }

        // 2. Standard <think> tags fallback
        if (rawText.includes('<think>')) {
            const startIndex = rawText.indexOf('<think>') + '<think>'.length;
            const endIndex = rawText.indexOf('</think>', startIndex);

            if (endIndex !== -1) {
                const thinking = rawText.slice(startIndex, endIndex).trim();
                const content = rawText.slice(endIndex + '</think>'.length).trim();
                return { thinking, content, isThinking: false };
            } else {
                const thinking = rawText.slice(startIndex).trim();
                return { thinking, content: '', isThinking: true };
            }
        }

        return { thinking: '', content: rawText.trim(), isThinking: false };
    }

    async #consumeStream(
        stream: AsyncGenerator<{ content?: string; thinking?: string; toolCalls?: any[] | null }>,
        onUpdate: ((text: string) => Promise<void> | void) | null
    ): Promise<{ currentContent: string; currentThinking: string; toolCalls: any[] }> {
        let currentContent = '';
        let currentThinking = '';
        let toolCalls: any[] = [];

        for await (const chunk of stream) {
            const incomingCalls = chunk.toolCalls || (chunk as any)?.tool_calls;
            if (incomingCalls && incomingCalls.length > 0) {
                toolCalls = incomingCalls;
            }

            if (chunk.thinking) {
                currentThinking += chunk.thinking;

                if (toolCalls.length === 0 && onUpdate) {
                    try {
                        const snippet = currentThinking.slice(-250);
                        const preview = `> ${Emojis.Loading} *深度推理思考中...*\n> ${snippet.replace(/\n/g, '\n> ')}`;
                        await onUpdate(preview);
                    } catch (err: any) {
                        console.warn('[AIClient] onUpdate error:', err.message);
                    }
                }
            }

            if (chunk.content) {
                currentContent += chunk.content;

                if (toolCalls.length === 0 && onUpdate) {
                    try {
                        const parsed = this.parseThinkingAndContent(currentContent);
                        if (parsed.isThinking) {
                            const snippet = parsed.thinking.slice(-250);
                            const preview = `> ${Emojis.Loading} *深度推理思考中...*\n> ${snippet.replace(/\n/g, '\n> ')}`;
                            await onUpdate(preview);
                        } else if (parsed.content) {
                            await onUpdate(DiscordSanitizer.sanitize(parsed.content));
                        }
                    } catch (err: any) {
                        console.warn('[AIClient] onUpdate error:', err.message);
                    }
                }
            }
        }

        return { currentContent, currentThinking, toolCalls };
    }

    async #executeToolCalls(
        toolCalls: any[],
        requestMessages: any[],
        context: {
            currentContent: string;
            executedToolCalls?: Map<string, string>;
            meta: any;
        }
    ): Promise<void> {
        requestMessages.push({
            role: 'assistant',
            content: context.currentContent || '',
            tool_calls: toolCalls
        });

        for (const toolCall of toolCalls) {
            const toolName = toolCall?.function?.name || 'unknown_tool';
            let args: any = {};
            const rawArgs = toolCall?.function?.arguments;

            if (typeof rawArgs === 'string') {
                try {
                    args = JSON.parse(rawArgs);
                } catch (parseErr: any) {
                    // Check if rawArgs contains DeepSeek DSML tags (e.g. <｜DSML｜parameter name="query"...>value</｜DSML｜parameter>)
                    const dsmlParamRegex =
                        /<[|｜]{1,2}DSML[|｜]{1,2}\s+parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)(?:<\/[|｜]{1,2}DSML[|｜]{1,2}\s+parameter>|$)/gi;
                    let match: RegExpExecArray | null;
                    let foundDsml = false;

                    while ((match = dsmlParamRegex.exec(rawArgs)) !== null) {
                        foundDsml = true;
                        const paramName = match[1];
                        const paramVal = match[2].trim();
                        try {
                            args[paramName] = JSON.parse(paramVal);
                        } catch {
                            args[paramName] = paramVal;
                        }
                    }

                    if (!foundDsml) {
                        console.warn(`[AIClient] Failed to parse tool arguments for ${toolName}:`, parseErr.message);
                    }
                }
            } else if (rawArgs && typeof rawArgs === 'object') {
                args = rawArgs;
            }

            // Sanitize any leaked DeepSeek DSML tags that may have leaked inside parameter values
            if (args && typeof args === 'object') {
                for (const key of Object.keys(args)) {
                    if (typeof args[key] === 'string') {
                        args[key] = args[key]
                            .replace(/<\/?[|｜]{1,2}DSML[|｜]{1,2}[^>]*>/gi, '')
                            .replace(/<[|｜]{1,2}[^>]*[|｜]{1,2}>/gi, '')
                            .trim();
                    }
                }
            }

            // Loop prevention: avoid re-running duplicate identical tool invocations in the same turn
            const callSignature = `${toolName}:${JSON.stringify(args)}`;
            let toolResult: string;

            if (context.executedToolCalls?.has(callSignature)) {
                const prevResult = context.executedToolCalls.get(callSignature);
                toolResult = `[系統提示] 此工具稍早已用相同參數執行過，結果為：${prevResult}。請直接根據已獲得的資訊回答使用者，請勿重複發起相同工具調用。`;
            } else {
                toolResult = await this.#toolRegistry.execute(toolName, args, context.meta);
                context.executedToolCalls?.set(callSignature, toolResult);
            }

            const toolMsg: any = {
                role: 'tool',
                name: toolName,
                tool_name: toolName,
                content: toolResult
            };

            if (toolCall?.id) {
                toolMsg.tool_call_id = toolCall.id;
            }

            requestMessages.push(toolMsg);
        }

        if (context.meta?.onUpdate) {
            try {
                await context.meta.onUpdate(`${Emojis.Loading} *(已取得工具資料，正在深度思考與組織回答中...)*`);
            } catch (err: any) {
                console.warn('[AIClient] onUpdate error:', err.message);
            }
        }
    }

    async generateImage(prompt: string, size: string = '3840x2160'): Promise<Buffer> {
        if (this.#imageService && this.#imageService.ready) {
            return await this.#imageService.generateImage(prompt, size);
        }
        throw new Error('圖片生成服務未就緒：未配置 API 金鑰。');
    }

    async urlToBase64(url: string): Promise<string | null> {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer).toString('base64');
        } catch (error: any) {
            console.error('[AIClient] urlToBase64 failed:', error.message);
            return null;
        }
    }

    /**
     * Facade methods for Model Management
     */
    switchModel(modelId: string, guildId?: string | null): boolean {
        return this.#modelRegistry.switchModel(modelId, guildId);
    }

    getModelList(guildId?: string | null): ModelStatusInfo[] {
        return this.#modelRegistry.listModels(guildId);
    }

    getActiveModel(guildId?: string | null): ModelEntry {
        return this.#modelRegistry.resolveActiveModel(guildId);
    }

    async testModel(modelId: string): Promise<{ ok: boolean; latency: number; error?: string }> {
        return await this.#modelRegistry.testModel(modelId);
    }
}

export default AIClient;
