import { AttachmentBuilder, Message } from 'discord.js';
import BaseMessageHandler from '../pipeline/BaseMessageHandler';
import DiscordStreamUpdater from '../core/ai/DiscordStreamUpdater';
import AIErrorDiagnostic, { cleanModelName, getModelEmoji, getProviderBrand } from '../core/ai/AIErrorDiagnostic';
import { AI as AIConfig, Emojis } from '../config';
import type BotClient from '../core/BotClient';
import type LargeFileCache from '../core/ai/LargeFileCache';
import { isPdf, extractTextFromPDF, renderPDFPagesAsImages } from '../utils/PDFUtils';

/**
 * AIStreamHandler — Handles chunk-by-chunk AI streaming responses, typing indicators, and file attachment delivery.
 * Uses DiscordStreamUpdater to eliminate Fire-and-Forget async race conditions and 429 Rate Limits.
 */
class AIStreamHandler extends BaseMessageHandler {
    /**
     * Process direct DM or bot mention messages for AI streaming responses.
     * Supports concurrent question handling so multiple questions can be answered simultaneously.
     */
    override async handle(message: Message, bot: BotClient | any): Promise<boolean> {
        // 1. Ignore @everyone or @here broadcasts to prevent unintended AI reply triggers
        if (message.mentions.everyone) {
            return false;
        }

        const isDM = !message.guild;
        const isMentioned = Boolean(
            bot.user && message.mentions.has(bot.user.id, { ignoreEveryone: true, ignoreRoles: true })
        );

        if (!isDM && !isMentioned) {
            // Passive Context Reading - consistently keyed by Discord global username
            const userName = message.author.username;
            if (bot.ai) {
                bot.ai.addPassiveContext(message.channel.id, userName, message.content);
            }
            return false;
        }

        const turnTimeoutMs = Number(process.env.AI_TURN_TIMEOUT_MS) || 0;

        try {
            if (turnTimeoutMs > 0) {
                let timeoutHandle: NodeJS.Timeout | undefined;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timeoutHandle = setTimeout(() => {
                        reject(
                            new Error(
                                `AI 回應逾時 (超過 ${Math.round(turnTimeoutMs / 60000)} 分鐘)，請縮短提問內容或使用 \`/model\` 切換模型。`
                            )
                        );
                    }, turnTimeoutMs);
                });
                try {
                    return await Promise.race([this.#processStream(message, bot), timeoutPromise]);
                } finally {
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                }
            } else {
                // Unlimited response time: allow complex reasoning models to finish large multi-page answers
                return await this.#processStream(message, bot);
            }
        } catch (outerErr: any) {
            console.warn('[AIStreamHandler] Turn execution error:', outerErr.message);
            await message
                .reply({
                    content: `${Emojis.Error} **AI 回應發生錯誤**\n${outerErr.message}`,
                    allowedMentions: { parse: [] }
                })
                .catch(() => {});
            return true;
        }
    }

    async #processStream(message: Message, bot: BotClient | any): Promise<boolean> {
        const isMentioned = Boolean(
            bot.user && message.mentions.has(bot.user.id, { ignoreEveryone: true, ignoreRoles: true })
        );

        let userMessage = message.content || '';
        if (isMentioned && bot.user) {
            userMessage = userMessage.replace(new RegExp(`<@!?${bot.user.id}>`), '').trim();
        } else {
            userMessage = userMessage.trim();
        }

        // Fetch referenced (replied-to) message context and attachments if user replied to a message
        let referencedMessage: Message | null = null;
        if (message.reference?.messageId && message.channel && (message.channel as any).messages?.fetch) {
            try {
                referencedMessage = await (message.channel as any).messages.fetch(message.reference.messageId);
            } catch {
                // Ignore fetch failure if message was deleted or unreachable
            }
        }

        let replyContext = '';
        if (referencedMessage?.content) {
            const isReplyingToBot = Boolean(bot.user && referencedMessage.author?.id === bot.user.id);
            const isReplyingToSelf = Boolean(referencedMessage.author?.id === message.author.id);
            const refAuthor = referencedMessage.author?.username || '某人';

            // If replying to the bot or self in a continuous session, the previous turn is already in session history.
            // Do NOT prepend the whole previous question or answer into the user prompt, as doing so tricks the LLM into answering both!
            if (!isReplyingToBot && !isReplyingToSelf) {
                replyContext = `【引用其他成員訊息 (${refAuthor}，僅供語境參考，請專注回答當前問題)】:\n${referencedMessage.content}\n\n`;
            }
        }

        const CODE_TEXT_EXTENSIONS = new Set([
            'asm',
            's',
            'nasm',
            'inc',
            'py',
            'java',
            'c',
            'cpp',
            'cc',
            'cxx',
            'h',
            'hpp',
            'hxx',
            'cs',
            'rs',
            'go',
            'js',
            'jsx',
            'ts',
            'tsx',
            'mjs',
            'cjs',
            'vue',
            'svelte',
            'html',
            'htm',
            'css',
            'scss',
            'sass',
            'less',
            'json',
            'jsonc',
            'txt',
            'text',
            'md',
            'markdown',
            'csv',
            'tsv',
            'xml',
            'yaml',
            'yml',
            'toml',
            'sh',
            'bash',
            'zsh',
            'bat',
            'cmd',
            'ps1',
            'sql',
            'ini',
            'conf',
            'cfg',
            'env',
            'log',
            'rb',
            'php',
            'lua',
            'r',
            'dart',
            'kt',
            'kts',
            'swift',
            'scala',
            'zig',
            'nim',
            'v',
            'pas',
            'f',
            'f90',
            'sol',
            'proto',
            'diff',
            'patch'
        ]);

        // Merge attachments from current message and referenced message
        const extractAttachments = (attSource: any): any[] => {
            if (!attSource) return [];
            if (Array.isArray(attSource)) return attSource;
            if (typeof attSource.values === 'function') {
                return Array.from(attSource.values());
            }
            if (typeof attSource.filter === 'function') {
                const filtered = attSource.filter(() => true);
                if (Array.isArray(filtered)) return filtered;
                if (filtered && typeof filtered.values === 'function') {
                    return Array.from(filtered.values());
                }
            }
            return [];
        };

        const rawAttachmentMap = new Map<string, any>();
        for (const att of extractAttachments(message.attachments)) {
            rawAttachmentMap.set(att.id || att.url, att);
        }
        if (referencedMessage?.attachments) {
            for (const att of extractAttachments(referencedMessage.attachments)) {
                if (!rawAttachmentMap.has(att.id || att.url)) {
                    rawAttachmentMap.set(att.id || att.url, att);
                }
            }
        }
        const allAttachments = Array.from(rawAttachmentMap.values());

        const imageAttachments = allAttachments.filter((a) => a.contentType?.startsWith('image/'));
        const pdfAttachments = allAttachments.filter((a) => {
            if (a.contentType?.startsWith('image/')) return false;
            return isPdf(a.contentType, a.name);
        });
        const textFileAttachments = allAttachments.filter((a) => {
            if (a.contentType?.startsWith('image/')) return false;
            if (isPdf(a.contentType, a.name)) return false;
            const filename = (a.name || '').toLowerCase();
            const ext = filename.split('.').pop() || '';
            const isTextMime =
                a.contentType?.startsWith('text/') ||
                a.contentType === 'application/json' ||
                a.contentType === 'application/javascript' ||
                a.contentType === 'application/typescript' ||
                a.contentType === 'application/xml' ||
                a.contentType === 'application/x-sh';
            return (
                CODE_TEXT_EXTENSIONS.has(ext) ||
                isTextMime ||
                filename === 'dockerfile' ||
                filename === 'makefile' ||
                filename === 'cmakelists.txt'
            );
        });

        if (replyContext) {
            userMessage = `${replyContext}${userMessage}`;
        }

        if (
            !userMessage &&
            imageAttachments.length === 0 &&
            textFileAttachments.length === 0 &&
            pdfAttachments.length === 0
        )
            return false;

        await (message.channel as any)
            .sendTyping()
            .catch((e: any) => console.warn('[AIStreamHandler] Typing error:', e.message));

        // 1. Send placeholder message BEFORE calling AI
        const aiMessage = await message
            .reply({
                content: `${Emojis.Loading} 思考中...`,
                allowedMentions: { parse: [] }
            })
            .catch(async () => {
                if (message.channel && typeof (message.channel as any).send === 'function') {
                    return (message.channel as any)
                        .send({
                            content: `${Emojis.Loading} 思考中...`,
                            allowedMentions: { parse: [] }
                        })
                        .catch(() => null);
                }
                return null;
            });

        const streamUpdater = aiMessage ? new DiscordStreamUpdater(aiMessage, AIConfig.StreamThrottleMs) : null;

        try {
            // Consistently use Discord global username across all guilds to avoid server nickname confusion
            const userName = message.author.username;

            let images: string[] = [];
            if (imageAttachments.length > 0 && bot.ai) {
                const fetchPromises = imageAttachments.map((att: any) => bot.ai.urlToBase64(att.url));
                const results = await Promise.all(fetchPromises);
                images = results.filter((img): img is string => Boolean(img));
            }

            // Read and attach text/code files and PDF documents to prompt.
            // Large files (> 40 KB) are stored in LargeFileCache and sent as a structural outline.
            // Small files are injected verbatim as before.
            const largeFileCache: LargeFileCache | null = (bot as any).largeFileCache ?? null;

            const textFilePromises = textFileAttachments.map(async (att: any) => {
                try {
                    const res = await fetch(att.url);
                    if (!res.ok) return null;
                    const rawText = await res.text();
                    const ext = (att.name || '').split('.').pop()?.toLowerCase() || '';

                    // Large file path: cache + send outline only
                    if (largeFileCache && largeFileCache.isLargeFile(rawText)) {
                        const targetChannelId = message.channel?.id || message.author?.id || 'dm';
                        largeFileCache.store(targetChannelId, att.name, rawText, ext);
                        const outline = largeFileCache.buildOutline(targetChannelId, att.name);
                        console.log(
                            `[AIStreamHandler] Large file "${att.name}" (${(Buffer.byteLength(rawText, 'utf8') / 1024).toFixed(1)} KB) stored in LargeFileCache; sending outline only.`
                        );
                        return outline || `【大型檔案: ${att.name} 已快取，請使用 inspect_code 工具查閱】`;
                    }

                    // Small file path: inject verbatim (existing behaviour)
                    const truncatedText =
                        rawText.length > 500000
                            ? rawText.slice(0, 500000) + '\n...[檔案過大，已截斷剩餘內容]...'
                            : rawText;
                    return `【附加檔案: ${att.name}】\n\`\`\`${ext}\n${truncatedText}\n\`\`\``;
                } catch (err: any) {
                    console.warn(`[AIStreamHandler] Failed to read attachment ${att.name}:`, err.message);
                    return `【附加檔案: ${att.name} (讀取失敗: ${err.message})】`;
                }
            });

            const pdfPromises = pdfAttachments.map(async (att: any) => {
                try {
                    const res = await fetch(att.url);
                    if (!res.ok) return `【附加 PDF: ${att.name} (下載失敗: HTTP ${res.status})】`;
                    const arrayBuffer = await res.arrayBuffer();
                    const pdfBytes = new Uint8Array(arrayBuffer);
                    const { text: pdfText, totalPages, pages, isEmpty } = await extractTextFromPDF(pdfBytes);

                    // Scanned / Image-heavy PDF detection:
                    // True if 0 pages have text, OR in a multi-page document where majority of pages are image-only scans with no text
                    const pagesWithText = pages.filter((p) => p.trim().length > 0).length;
                    const isScannedOrSparse =
                        isEmpty || (totalPages > 1 && pagesWithText <= Math.floor(totalPages / 2));

                    if (isScannedOrSparse) {
                        const renderedImages = await renderPDFPagesAsImages(pdfBytes, { maxPages: 6, scale: 1.5 });
                        if (renderedImages.length > 0) {
                            images.push(...renderedImages);
                            if (isEmpty) {
                                return `【附加掃描版 PDF: ${att.name}（共 ${totalPages} 頁，未含數位純文字，已自動轉為前 ${renderedImages.length} 頁高解析度圖像供視覺模型直接閱覽題目與作答）】`;
                            }
                            return `【附加掃描版 PDF: ${att.name}（共 ${totalPages} 頁，部分頁面為圖片掃描檔，已自動附帶前 ${renderedImages.length} 頁高解析度圖像供視覺模型閱覽圖文內容）】\n\`\`\`text\n${pdfText}\n\`\`\``;
                        }
                        if (isEmpty) {
                            return `【附加 PDF: ${att.name}（共 ${totalPages} 頁）】\n（未偵測到純文字內容，可能為純掃描圖片或加密檔案）`;
                        }
                    }

                    // Large file path: cache + send outline only
                    if (largeFileCache && largeFileCache.isLargeFile(pdfText)) {
                        const targetChannelId = message.channel?.id || message.author?.id || 'dm';
                        largeFileCache.store(targetChannelId, att.name, pdfText, 'pdf');
                        const outline = largeFileCache.buildOutline(targetChannelId, att.name);
                        console.log(
                            `[AIStreamHandler] Large PDF "${att.name}" (${(Buffer.byteLength(pdfText, 'utf8') / 1024).toFixed(1)} KB, ${totalPages} 頁) stored in LargeFileCache; sending outline only.`
                        );
                        return outline || `【大型 PDF: ${att.name}（共 ${totalPages} 頁）已快取，請使用 inspect_code 工具查閱】`;
                    }

                    const truncatedText =
                        pdfText.length > 500000
                            ? pdfText.slice(0, 500000) + '\n...[PDF 內容過長，已截斷剩餘內容]...'
                            : pdfText;
                    return `【附加 PDF: ${att.name}（共 ${totalPages} 頁）】\n${truncatedText}`;
                } catch (err: any) {
                    console.warn(`[AIStreamHandler] Failed to read PDF attachment ${att.name}:`, err.message);
                    return `【附加 PDF: ${att.name} (讀取失敗: ${err.message})】`;
                }
            });

            if (textFileAttachments.length > 0 || pdfAttachments.length > 0) {
                const fileSnippets = (await Promise.all([...textFilePromises, ...pdfPromises])).filter(Boolean);
                if (fileSnippets.length > 0) {
                    const joinedFiles = fileSnippets.join('\n\n');
                    userMessage = userMessage
                        ? `${userMessage}\n\n${joinedFiles}`
                        : `請查看並分析我上傳的檔案：\n\n${joinedFiles}`;
                }
            }

            // 2. Call generateResponse and stream chunk updates using DiscordStreamUpdater
            const targetChannelId = message.channel?.id || message.author?.id || 'dm';
            const responseResult = await bot.ai.generateResponse(
                userMessage,
                targetChannelId,
                userName,
                async (currentText: string) => {
                    if (streamUpdater) {
                        await streamUpdater.push(currentText);
                    }
                },
                images,
                {
                    guildId: message.guild?.id,
                    largeFileCache: largeFileCache ?? undefined,
                    userId: message.author.id
                }
            );

            const rawReplyText = typeof responseResult === 'object' ? responseResult.text : responseResult;
            const initialAttachments =
                typeof responseResult === 'object' && Array.isArray(responseResult.attachments)
                    ? [...responseResult.attachments]
                    : [];

            // Automatically package code blocks into attachments and collapse long code dumps in chat text
            const { attachments, replyText: finalReplyText } = this.processCodeAttachments(
                userMessage,
                rawReplyText,
                initialAttachments
            );

            const files = attachments.map((att: { filename: string; content: string | Buffer }) => {
                const buf = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, 'utf-8');
                return new AttachmentBuilder(buf, { name: att.filename });
            });

            let disclaimer = '';
            if (AIConfig.Disclaimer) {
                let modelName = 'AI';
                let modelEmoji = '🤖';
                let providerName = 'Cloud';

                if (bot?.ai && typeof bot.ai.getActiveModel === 'function') {
                    const activeModel = bot.ai.getActiveModel(message.guild?.id);
                    if (activeModel) {
                        modelName = cleanModelName(activeModel.name || activeModel.id || 'AI');
                        modelEmoji = getModelEmoji(activeModel.id || '');
                        providerName = getProviderBrand(activeModel);
                    }
                }

                const formattedDisclaimer = AIConfig.Disclaimer.replace('{emoji}', modelEmoji)
                    .replace('{model}', modelName)
                    .replace('{provider}', providerName);
                disclaimer = `\n\n${formattedDisclaimer}`;
            }
            const replyWithDisclaimer = `${finalReplyText}${disclaimer}`;

            // 3. Finalize response cleanly with attachments
            if (streamUpdater) {
                await streamUpdater.finalize(replyWithDisclaimer, files);
            } else if (aiMessage) {
                const payload: any = {
                    content: replyWithDisclaimer,
                    allowedMentions: { parse: [] }
                };
                if (files.length > 0) payload.files = files;
                await aiMessage.edit(payload);
            } else {
                const payload: any = {
                    content: replyWithDisclaimer,
                    allowedMentions: { parse: [] }
                };
                if (files.length > 0) payload.files = files;
                if (typeof message.reply === 'function') {
                    await message.reply(payload).catch(async () => {
                        if (message.channel && typeof (message.channel as any).send === 'function') {
                            await (message.channel as any).send(payload).catch(() => {});
                        }
                    });
                } else if (message.channel && typeof (message.channel as any).send === 'function') {
                    await (message.channel as any).send(payload).catch(() => {});
                }
            }

            // 4. Background asynchronous memory reflection (Engine 2: PaiMon's Notebook)
            if (bot?.memoryReflector && finalReplyText) {
                const authorId = message.author.id;
                const authorName = userName;
                const authorMessage = userMessage;
                const replyText = finalReplyText;
                setImmediate(() => {
                    bot.memoryReflector
                        .reflect({
                            userId: authorId,
                            userName: authorName,
                            userMessage: authorMessage,
                            assistantReply: replyText,
                            llmProvider: bot.ai.llmProvider,
                            model: bot.ai.model
                        })
                        .catch((err: any) =>
                            console.warn('[AIStreamHandler] MemoryReflector background error:', err.message)
                        );
                });
            }

            return true;
        } catch (error: any) {
            console.warn('[AIStreamHandler] Routing error:', error.message);

            const activeModel =
                bot?.ai && typeof bot.ai.getActiveModel === 'function'
                    ? bot.ai.getActiveModel(message.guild?.id)
                    : null;

            const errorCard = AIErrorDiagnostic.formatErrorMessage({
                error,
                modelId: activeModel?.id,
                modelName: activeModel?.name,
                providerKey: activeModel?.providerKey
            });

            if (streamUpdater) {
                await streamUpdater.finalize(errorCard);
            } else if (aiMessage) {
                await aiMessage
                    .edit({ content: errorCard, allowedMentions: { parse: [] } })
                    .catch((e: any) => console.warn('[AIStreamHandler] Failed to edit error message:', e.message));
            } else {
                await message
                    .reply({ content: errorCard, allowedMentions: { parse: [] } })
                    .catch(async (e: any) => {
                        if (message.channel && typeof (message.channel as any).send === 'function') {
                            await (message.channel as any)
                                .send({ content: errorCard, allowedMentions: { parse: [] } })
                                .catch(() => {});
                        } else {
                            console.warn('[AIStreamHandler] Failed to reply error message:', e.message);
                        }
                    });
            }
            return true;
        }
    }

    /**
     * Processes code blocks in AI response:
     * 1. Detects large code blocks (>= 15 lines or >= 400 chars) or complete script requests.
     * 2. Automatically converts them into downloadable attachments if not already present.
     * 3. Replaces lengthy code blocks in chat text with clean attachment download notices.
     */
    processCodeAttachments(
        userPrompt: string,
        replyText: string,
        existingAttachments: Array<{ filename: string; content: string | Buffer }> = []
    ): { attachments: Array<{ filename: string; content: string | Buffer }>; replyText: string } {
        if (!replyText || typeof replyText !== 'string') {
            return { attachments: existingAttachments || [], replyText: replyText || '' };
        }

        const attachments: Array<{ filename: string; content: string | Buffer }> = Array.isArray(existingAttachments)
            ? [...existingAttachments]
            : [];

        const isScriptOrFileRequest =
            /(?:寫|製作|做|生成|編寫|提供|存成|輸出成|下載|打包).*(?:代碼|程式|腳本|script|code|bot|爬蟲|網頁|專案|檔|文件|\.py|\.js|\.json|\.txt|\.html|\.md|\.css|\.csv)/i.test(
                userPrompt || ''
            );

        // Match markdown code blocks: ```[lang]\n[code]```
        const codeBlockRegex = /```(?:([a-zA-Z0-9_#+-]+)\r?\n)?([\s\S]*?)```/g;
        let fileIndex = attachments.length + 1;

        const replacedText = replyText.replace(codeBlockRegex, (match, rawLang, rawCode, offset) => {
            const lang = (rawLang || '').trim().toLowerCase();
            const code = (rawCode || '').trim();
            if (!code) return match;

            const lines = code.split(/\r?\n/);
            const lineCount = lines.length;
            const charCount = code.length;

            // Check if code qualifies for packaging
            const isLongCode = lineCount >= 15 || charCount >= 400;
            const isCompleteSnippet =
                lineCount >= 8 && /(?:def |function\s|class\s|import\s|<!DOCTYPE|<html|#include)/.test(code);
            const shouldPackage = isLongCode || (isScriptOrFileRequest && isCompleteSnippet);

            if (!shouldPackage) {
                return match; // Keep short code snippets inline
            }

            // 1. Try to find filename in code header comment (e.g., // app.js, # main.py, <!-- index.html -->)
            let filename = '';
            const headerMatch = code
                .slice(0, 300)
                .match(/^(?:#|\/\/|\/\*|<!--|--|;)\s*([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)/m);
            if (headerMatch && headerMatch[1]) {
                filename = headerMatch[1].trim();
            }

            // 2. Try to find filename mentioned immediately before the code block
            if (!filename && offset > 0) {
                const textBefore = replyText.slice(Math.max(0, offset - 120), offset);
                const preMatch = textBefore.match(
                    /[`'"]([a-zA-Z0-9_.-]+\.(?:py|js|ts|html|css|json|md|txt|cpp|c|cs|java|go|rs|php|sh|bat|ps1|sql|csv))[`'"]/i
                );
                if (preMatch && preMatch[1]) {
                    filename = preMatch[1].trim();
                }
            }

            // 3. Try to find filename mentioned in user prompt
            if (!filename && userPrompt) {
                const promptMatch = userPrompt.match(
                    /\b([a-zA-Z0-9_-]+\.(?:py|js|ts|html|css|json|md|txt|cpp|c|cs|java|go|rs|php|sh|bat|ps1|sql|csv))\b/i
                );
                if (promptMatch && promptMatch[1]) {
                    filename = promptMatch[1].trim();
                }
            }

            // 4. Infer from language or fallback
            if (!filename) {
                const extMap: Record<string, string> = {
                    python: 'py',
                    py: 'py',
                    javascript: 'js',
                    js: 'js',
                    typescript: 'ts',
                    ts: 'ts',
                    html: 'html',
                    htm: 'html',
                    css: 'css',
                    json: 'json',
                    markdown: 'md',
                    md: 'md',
                    bash: 'sh',
                    sh: 'sh',
                    shell: 'sh',
                    zsh: 'sh',
                    powershell: 'ps1',
                    ps1: 'ps1',
                    bat: 'bat',
                    cmd: 'bat',
                    sql: 'sql',
                    cpp: 'cpp',
                    'c++': 'cpp',
                    c: 'c',
                    csharp: 'cs',
                    'c#': 'cs',
                    java: 'java',
                    go: 'go',
                    golang: 'go',
                    rust: 'rs',
                    rs: 'rs',
                    php: 'php',
                    ruby: 'rb',
                    rb: 'rb',
                    yaml: 'yml',
                    yml: 'yml',
                    xml: 'xml',
                    csv: 'csv',
                    text: 'txt',
                    txt: 'txt'
                };
                let ext = extMap[lang];
                if (!ext) {
                    if (/(?:def |import |if __name__)/.test(code)) ext = 'py';
                    else if (/(?:const |let |var |console\.log)/.test(code)) ext = 'js';
                    else if (/(?:<!DOCTYPE|<html)/.test(code)) ext = 'html';
                    else if (/^[{[]/.test(code)) ext = 'json';
                    else ext = 'txt';
                }

                if (ext === 'py') filename = fileIndex === 1 ? 'main.py' : `script_${fileIndex}.py`;
                else if (ext === 'js') filename = fileIndex === 1 ? 'index.js' : `script_${fileIndex}.js`;
                else if (ext === 'ts') filename = fileIndex === 1 ? 'index.ts' : `script_${fileIndex}.ts`;
                else if (ext === 'html') filename = fileIndex === 1 ? 'index.html' : `page_${fileIndex}.html`;
                else if (ext === 'css') filename = fileIndex === 1 ? 'style.css' : `style_${fileIndex}.css`;
                else if (ext === 'json') filename = fileIndex === 1 ? 'data.json' : `data_${fileIndex}.json`;
                else filename = `script_${fileIndex}.${ext}`;
            }

            filename = filename.replace(/[/\\?%*:|"<>]/g, '_');

            // Check if existing attachment matches this code or filename
            const existing = attachments.find(
                (att) =>
                    att.filename.toLowerCase() === filename.toLowerCase() ||
                    (typeof att.content === 'string' && att.content.trim() === code)
            );

            if (existing) {
                filename = existing.filename;
            } else {
                let uniqueFilename = filename;
                let counter = 2;
                while (attachments.some((att) => att.filename.toLowerCase() === uniqueFilename.toLowerCase())) {
                    const dotIndex = filename.lastIndexOf('.');
                    if (dotIndex !== -1) {
                        uniqueFilename = `${filename.slice(0, dotIndex)}_${counter}${filename.slice(dotIndex)}`;
                    } else {
                        uniqueFilename = `${filename}_${counter}`;
                    }
                    counter++;
                }
                filename = uniqueFilename;
                attachments.push({
                    filename,
                    content: code
                });
                fileIndex++;
            }

            return `\n*(📄 完整程式碼已打包為檔案 \`${filename}\`，請於下方附件直接下載使用)*\n`;
        });

        let finalCleaned = replacedText.trim();
        if (
            finalCleaned.startsWith('*(📄 完整程式碼已打包為檔案') &&
            finalCleaned.endsWith(')*') &&
            attachments.length > 0
        ) {
            finalCleaned = `本派蒙已經把完整的程式碼打包好囉！\n\n${finalCleaned}\n\n可以直接下載檔案查看並運行～`;
        }

        return {
            attachments,
            replyText: finalCleaned
        };
    }
}

export default AIStreamHandler;
