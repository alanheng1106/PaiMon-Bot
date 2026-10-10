import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AIStreamHandler from '../src/handlers/AIStreamHandler';
import { AI as AIConfig } from '../src/config';
import { buildPdfWithPages } from './pdfTestHelper.js';

describe('AIStreamHandler (Streaming AI Pipeline Handler)', () => {
    it('appends configured disclaimer at the bottom of AI reply', async () => {
        const handler = new AIStreamHandler();

        let finalEditedContent = '';
        const mockAiMessage = {
            edit: async (payload) => {
                finalEditedContent = payload.content;
                return mockAiMessage;
            }
        };

        const mockUserMessage = {
            guild: null, // isDM = true
            content: 'Hello AI',
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            channel: {
                sendTyping: async () => {}
            },
            reply: async () => mockAiMessage,
            member: null,
            author: { username: 'TestUser' },
            mentions: { has: () => false }
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: {
                getActiveModel: () => ({ id: 'vtc-deepseek', name: 'DeepSeek-V4 Thinking (VTC 深度推理)' }),
                generateResponse: async () => 'This is the AI response.'
            }
        };

        const handled = await handler.handle(mockUserMessage, mockBot);
        assert.equal(handled, true);
        assert.ok(finalEditedContent.includes('This is the AI response.'));
        assert.ok(finalEditedContent.includes('DeepSeek-V4 Thinking'));
        assert.ok(finalEditedContent.endsWith('-# <:deepseek:1552670847406313562>  •  DeepSeek-V4 Thinking  •  VTC'));
    });

    it('extracts long code blocks into attachments and collapses them in replyText', () => {
        const handler = new AIStreamHandler();
        const codeLines = Array.from({ length: 25 }, (_, i) => `    print("Line ${i + 1}")`).join('\n');
        const rawCode = `\`\`\`python\n# snake_game.py\nimport pygame\ndef main():\n${codeLines}\nif __name__ == '__main__':\n    main()\n\`\`\``;
        const replyText = `這是一個貪吃蛇遊戲：\n${rawCode}\n請運行 python snake_game.py 啟動！`;

        const result = handler.processCodeAttachments('幫我寫個貪吃蛇', replyText);

        assert.equal(result.attachments.length, 1);
        assert.equal(result.attachments[0].filename, 'snake_game.py');
        assert.ok(result.attachments[0].content.includes('import pygame'));
        // Verify long code block was collapsed into notice
        assert.ok(result.replyText.includes('*(📄 完整程式碼已打包為檔案 `snake_game.py`，請於下方附件直接下載使用)*'));
        assert.ok(!result.replyText.includes('print("Line 1")'));
        assert.ok(result.replyText.includes('請運行 python snake_game.py 啟動！'));
    });

    it('retains short code snippets and terminal commands inline without packaging', () => {
        const handler = new AIStreamHandler();
        const shortCode = '```bash\nnpm install discord.js\n```';
        const replyText = `請先安裝依賴：\n${shortCode}\n然後就可以啟動了。`;

        const result = handler.processCodeAttachments('怎麼安裝？', replyText);

        assert.equal(result.attachments.length, 0);
        assert.equal(result.replyText, replyText);
    });

    it('deduplicates when AI already called create_file tool and collapses inline code block', () => {
        const handler = new AIStreamHandler();
        const code = `\`\`\`javascript\n// bot.js\nconst { Client } = require('discord.js');\nconst client = new Client();\n${Array.from({ length: 20 }, (_, i) => `console.log(${i});`).join('\n')}\n\`\`\``;
        const replyText = `代碼如下：\n${code}`;
        const existingAttachments = [{ filename: 'bot.js', content: 'const { Client } = require("discord.js");' }];

        const result = handler.processCodeAttachments('幫我寫個機器人', replyText, existingAttachments);

        // Attachment count should not double
        assert.equal(result.attachments.length, 1);
        assert.equal(result.attachments[0].filename, 'bot.js');
        // The inline code block is still collapsed cleanly
        assert.ok(result.replyText.includes('*(📄 完整程式碼已打包為檔案 `bot.js`，請於下方附件直接下載使用)*'));
    });

    it('packages code into AttachmentBuilder files during handle() execution', async () => {
        const handler = new AIStreamHandler();

        let finalEditedPayload = null;
        const mockAiMessage = {
            edit: async (payload) => {
                finalEditedPayload = payload;
                return mockAiMessage;
            }
        };

        const mockUserMessage = {
            guild: null,
            content: '幫我寫一個爬蟲腳本',
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            channel: {
                sendTyping: async () => {}
            },
            reply: async () => mockAiMessage,
            member: null,
            author: { username: 'CrawlerUser' },
            mentions: { has: () => false }
        };

        const longScript = `\`\`\`python\n# scraper.py\nimport requests\nfrom bs4 import BeautifulSoup\n${Array.from({ length: 20 }, (_, i) => `def step_${i}(): pass`).join('\n')}\n\`\`\``;

        const mockBot = {
            user: { id: 'bot-123' },
            ai: {
                getActiveModel: () => ({ id: 'ollama-gemma', name: 'Gemma 4 (Ollama 官方雲端平台)' }),
                generateResponse: async () => `爬蟲腳本如下：\n${longScript}\n運行方式請查看說明。`
            }
        };

        const handled = await handler.handle(mockUserMessage, mockBot);
        assert.equal(handled, true);
        assert.ok(finalEditedPayload);
        assert.ok(finalEditedPayload.files && finalEditedPayload.files.length === 1);
        assert.equal(finalEditedPayload.files[0].name, 'scraper.py');
        assert.ok(
            finalEditedPayload.content.includes('*(📄 完整程式碼已打包為檔案 `scraper.py`，請於下方附件直接下載使用)*')
        );
        assert.ok(finalEditedPayload.content.includes('Gemma 4  •  Ollama'));
    });

    it('ignores @everyone and @here broadcasts completely without triggering AI or typing', async () => {
        const handler = new AIStreamHandler();
        let typingCalled = false;
        let replyCalled = false;

        const mockUserMessage = {
            guild: { id: 'guild-1' },
            content: '@everyone 請注意伺服器維護公告',
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            channel: {
                id: 'channel-1',
                sendTyping: async () => {
                    typingCalled = true;
                }
            },
            reply: async () => {
                replyCalled = true;
                return {};
            },
            member: { displayName: 'Admin' },
            author: { username: 'Admin' },
            mentions: {
                everyone: true,
                has: () => true // Discord.js has() returns true on @everyone by default
            }
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: {
                generateResponse: async () => 'Should not be called',
                addPassiveContext: () => {}
            }
        };

        const handled = await handler.handle(mockUserMessage, mockBot);
        assert.equal(handled, false);
        assert.equal(typingCalled, false);
        assert.equal(replyCalled, false);
    });

    it('ignores role mentions and passes options { ignoreEveryone: true, ignoreRoles: true } to message.mentions.has', async () => {
        const handler = new AIStreamHandler();
        let passedOptions = null;
        let passiveContextAdded = false;

        const mockUserMessage = {
            guild: { id: 'guild-1' },
            content: '@Moderator 這裡有狀況需要處理',
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            channel: {
                id: 'channel-1',
                sendTyping: async () => {}
            },
            reply: async () => ({}),
            member: { displayName: 'User1' },
            author: { username: 'User1' },
            mentions: {
                everyone: false,
                has: (id, options) => {
                    passedOptions = options;
                    return false; // Not directly mentioning bot
                }
            }
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: {
                generateResponse: async () => 'Should not be called',
                addPassiveContext: () => {
                    passiveContextAdded = true;
                }
            }
        };

        const handled = await handler.handle(mockUserMessage, mockBot);
        assert.equal(handled, false);
        assert.equal(passedOptions?.ignoreEveryone, true);
        assert.equal(passedOptions?.ignoreRoles, true);
        assert.equal(passiveContextAdded, true);
    });

    it('dynamically adapts disclaimer to current active model (e.g. GPT-5.4, Qwen 3.7 Max)', async () => {
        const handler = new AIStreamHandler();

        let finalEditedContent = '';
        const mockAiMessage = {
            edit: async (payload) => {
                finalEditedContent = payload.content;
                return mockAiMessage;
            }
        };

        const mockUserMessage = {
            guild: { id: 'guild-999' },
            content: 'Hello AI',
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            channel: {
                sendTyping: async () => {}
            },
            reply: async () => mockAiMessage,
            member: null,
            author: { username: 'TestUser' },
            mentions: { has: () => true }
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: {
                getActiveModel: (guildId) =>
                    guildId === 'guild-999'
                        ? { id: 'vtc-gpt', name: 'GPT-5.4 (VTC 通用智慧)' }
                        : { id: 'vtc-qwen', name: 'Qwen 3.7 Max (VTC 旗艦長文本)' },
                generateResponse: async () => 'Answer from GPT'
            }
        };

        await handler.handle(mockUserMessage, mockBot);
        assert.ok(finalEditedContent.includes('Answer from GPT'));
        assert.ok(finalEditedContent.endsWith('-# <:chatgpt:1552673091241508945>  •  GPT-5.4  •  VTC'));
    });

    it('delivers transparent diagnostic error report to user when inference throws content moderation error', async () => {
        const handler = new AIStreamHandler();

        let finalEditedContent = '';
        const mockAiMessage = {
            edit: async (payload) => {
                finalEditedContent = payload.content;
                return mockAiMessage;
            }
        };

        const mockUserMessage = {
            guild: { id: 'guild-123' },
            content: '請問某某敏感話題',
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            channel: {
                sendTyping: async () => {}
            },
            reply: async () => mockAiMessage,
            member: null,
            author: { username: 'TestUser' },
            mentions: { has: () => true }
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: {
                getActiveModel: () => ({
                    id: 'vtc-qwen',
                    name: 'Qwen 3.7 Max (VTC 旗艦長文本)',
                    providerKey: 'vtc'
                }),
                generateResponse: async () => {
                    throw new Error(
                        'VTC 500: Unknown error occurred while calling qwen3.7-max API: 400 Input data may contain inappropriate content. For details, see: https://www.alibabacloud.com/help/en/model-studio/error-code#inappropriate-content'
                    );
                }
            }
        };

        const handled = await handler.handle(mockUserMessage, mockBot);
        assert.equal(handled, true);
        assert.ok(finalEditedContent.includes('### <a:cross:1524603300752785550> AI 運算節點回報異常'));
        assert.ok(finalEditedContent.includes('Qwen 3.7 Max'));
        assert.ok(finalEditedContent.includes('VTC GenAI'));
        assert.ok(finalEditedContent.includes('🛑 內容安全審核攔截'));
        assert.ok(finalEditedContent.includes('Input data may contain inappropriate content'));
        assert.ok(finalEditedContent.includes('/model'));
        assert.equal(finalEditedContent.includes('抱歉，我思考的时候短路了'), false);
    });

    it('downloads and injects code attachments (e.g. main.asm) into prompt for AI analysis', async () => {
        const handler = new AIStreamHandler();

        let capturedPrompt = '';
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            if (String(url).includes('main.asm')) {
                return {
                    ok: true,
                    text: async () => 'section .data\nmsg db "Hello World", 0'
                };
            }
            return { ok: false };
        };

        try {
            const mockAiMessage = {
                edit: async () => mockAiMessage
            };

            const mockUserMessage = {
                guild: { id: 'guild-1' },
                content: '幫我看看這串代碼',
                attachments: {
                    filter: (predicate) => {
                        const all = [
                            {
                                id: 'att-1',
                                name: 'main.asm',
                                url: 'https://cdn.discordapp.com/attachments/123/main.asm',
                                contentType: 'text/x-asm'
                            }
                        ];
                        const matched = all.filter(predicate);
                        return {
                            size: matched.length,
                            values: () => matched
                        };
                    }
                },
                channel: {
                    sendTyping: async () => {}
                },
                reply: async () => mockAiMessage,
                member: null,
                author: { username: 'Alan' },
                mentions: { has: () => true }
            };

            const mockBot = {
                user: { id: 'bot-123' },
                ai: {
                    generateResponse: async (prompt) => {
                        capturedPrompt = prompt;
                        return '代碼已分析完成';
                    }
                }
            };

            const handled = await handler.handle(mockUserMessage, mockBot);
            assert.equal(handled, true);
            assert.ok(capturedPrompt.includes('幫我看看這串代碼'));
            assert.ok(capturedPrompt.includes('【附加檔案: main.asm】'));
            assert.ok(capturedPrompt.includes('msg db "Hello World"'));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('downloads, extracts, and injects PDF attachments into prompt for AI analysis', async () => {
        const handler = new AIStreamHandler();

        let capturedPrompt = '';
        const originalFetch = globalThis.fetch;
        const pdfBytes = buildPdfWithPages(['Page 1 PDF Content', 'Page 2 PDF Content']);
        globalThis.fetch = async (url) => {
            if (String(url).includes('report.pdf')) {
                return {
                    ok: true,
                    status: 200,
                    arrayBuffer: async () => pdfBytes.buffer
                };
            }
            return { ok: false, status: 404 };
        };

        try {
            const mockAiMessage = {
                edit: async () => mockAiMessage
            };

            const mockUserMessage = {
                guild: { id: 'guild-1' },
                content: '幫我總結這份報告',
                attachments: {
                    filter: (predicate) => {
                        const all = [
                            {
                                id: 'att-pdf-1',
                                name: 'report.pdf',
                                url: 'https://cdn.discordapp.com/attachments/123/report.pdf',
                                contentType: 'application/pdf'
                            }
                        ];
                        const matched = all.filter(predicate);
                        return {
                            size: matched.length,
                            values: () => matched
                        };
                    }
                },
                channel: {
                    sendTyping: async () => {}
                },
                reply: async () => mockAiMessage,
                member: null,
                author: { username: 'Duck' },
                mentions: { has: () => true }
            };

            const mockBot = {
                user: { id: 'bot-123' },
                ai: {
                    generateResponse: async (prompt) => {
                        capturedPrompt = prompt;
                        return '總結完成';
                    }
                }
            };

            const handled = await handler.handle(mockUserMessage, mockBot);
            assert.equal(handled, true);
            assert.ok(capturedPrompt.includes('幫我總結這份報告'));
            assert.ok(capturedPrompt.includes('【附加 PDF: report.pdf（共 2 頁）】'));
            assert.ok(capturedPrompt.includes('--- 第 1 頁 ---'));
            assert.ok(capturedPrompt.includes('Page 1 PDF Content'));
            assert.ok(capturedPrompt.includes('--- 第 2 頁 ---'));
            assert.ok(capturedPrompt.includes('Page 2 PDF Content'));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('falls back to rendering pages as images for scanned/image-only PDFs and passes to vision model', async () => {
        const handler = new AIStreamHandler();

        let capturedPrompt = '';
        let capturedImages = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            if (String(url).includes('scanned.pdf')) {
                return {
                    ok: true,
                    status: 200,
                    arrayBuffer: async () => buildPdfWithPages(['']).buffer.slice(0)
                };
            }
            return { ok: false, status: 404 };
        };

        try {
            const mockAiMessage = {
                edit: async () => mockAiMessage
            };

            const mockUserMessage = {
                guild: { id: 'guild-1' },
                content: '幫我看這份手寫掃描檔',
                attachments: {
                    filter: (predicate) => {
                        const all = [
                            {
                                id: 'att-scan-1',
                                name: 'scanned.pdf',
                                url: 'https://cdn.discordapp.com/attachments/123/scanned.pdf',
                                contentType: 'application/pdf'
                            }
                        ];
                        const matched = all.filter(predicate);
                        return {
                            size: matched.length,
                            values: () => matched
                        };
                    }
                },
                channel: {
                    sendTyping: async () => {}
                },
                reply: async () => mockAiMessage,
                member: null,
                author: { username: 'Duck' },
                mentions: { has: () => true }
            };

            const mockBot = {
                user: { id: 'bot-123' },
                ai: {
                    generateResponse: async (prompt, _cid, _user, _update, images) => {
                        capturedPrompt = prompt;
                        capturedImages = images;
                        return '掃描檔視覺分析完畢';
                    }
                }
            };

            const handled = await handler.handle(mockUserMessage, mockBot);
            assert.equal(handled, true);
            assert.ok(capturedPrompt.includes('附加掃描版 PDF: scanned.pdf'));
            assert.ok(capturedImages.length > 0, 'Must contain rendered page images for Vision model');
            assert.ok(capturedImages[0].startsWith('data:image/png;base64,'));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('always prioritizes author.username over member.displayName when prompting AI and recording context', async () => {
        const handler = new AIStreamHandler();
        let passedUserName = null;

        const mockAiMessage = {
            edit: async () => {}
        };

        const mockUserMessage = {
            guild: { id: 'guild-1' },
            content: '派蒙你好！',
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            channel: {
                id: 'channel-1',
                sendTyping: async () => {}
            },
            reply: async () => mockAiMessage,
            member: { displayName: '伺服器特殊暱稱' },
            author: { id: 'u100', username: 'global_user_duck' },
            mentions: {
                everyone: false,
                has: () => true
            }
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: {
                generateResponse: async (prompt, channelId, userName) => {
                    passedUserName = userName;
                    return '你好呀！';
                }
            }
        };

        const handled = await handler.handle(mockUserMessage, mockBot);
        assert.equal(handled, true);
        assert.equal(passedUserName, 'global_user_duck');
    });

    it('uses author.username for passive context reading', async () => {
        const handler = new AIStreamHandler();
        let passiveUserName = null;

        const mockUserMessage = {
            guild: { id: 'guild-1' },
            content: '一般聊天內容',
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            channel: { id: 'channel-1' },
            member: { displayName: '聊天室暱稱' },
            author: { id: 'u100', username: 'real_username' },
            mentions: {
                everyone: false,
                has: () => false
            }
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: {
                addPassiveContext: (channelId, userName) => {
                    passiveUserName = userName;
                }
            }
        };

        const handled = await handler.handle(mockUserMessage, mockBot);
        assert.equal(handled, false);
        assert.equal(passiveUserName, 'real_username');
    });

    it('does not duplicate previous question into prompt when user replies to bot or self', async () => {
        const handler = new AIStreamHandler();
        let capturedPrompt = '';

        const mockUserMessage = {
            guild: { id: 'guild-1' },
            content: '那它怎麼運作？',
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            channel: {
                id: 'channel-1',
                sendTyping: async () => {},
                messages: {
                    fetch: async () => ({
                        content: '什麼是 Docker？',
                        author: { id: 'u100', username: 'real_username' } // replying to self
                    })
                }
            },
            reference: { messageId: 'msg-prev' },
            reply: async () => ({ edit: async () => {} }),
            member: null,
            author: { id: 'u100', username: 'real_username' },
            mentions: {
                everyone: false,
                has: () => true
            }
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: {
                generateResponse: async (prompt) => {
                    capturedPrompt = prompt;
                    return '這是回答。';
                }
            }
        };

        const handled = await handler.handle(mockUserMessage, mockBot);
        assert.equal(handled, true);
        // Prompt should NOT contain the old question "什麼是 Docker？" prepended as a duplicate
        assert.ok(!capturedPrompt.includes('什麼是 Docker？'));
        assert.ok(capturedPrompt.includes('那它怎麼運作？'));
    });

    it('processes DM messages directly without mention using Discord username', async () => {
        const handler = new AIStreamHandler();
        let receivedPrompt = '';
        let receivedUser = '';
        let replyPayload = null;

        const mockAiMessage = {
            edit: async (payload) => {
                replyPayload = payload;
                return mockAiMessage;
            }
        };

        const mockUserMessage = {
            guild: null, // DM message (no guild)
            content: '你好，私信問你一個問題！',
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            channel: {
                id: 'dm-channel-1',
                sendTyping: async () => {}
            },
            reply: async () => mockAiMessage,
            author: { id: 'user-dm-1', username: 'john_doe' },
            mentions: {
                everyone: false,
                has: () => false // No mention of bot required in DM
            }
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: {
                generateResponse: async (prompt, _cid, userName) => {
                    receivedPrompt = prompt;
                    receivedUser = userName;
                    return '私信回覆：你好呀！';
                }
            }
        };

        const handled = await handler.handle(mockUserMessage, mockBot);
        assert.equal(handled, true);
        assert.equal(receivedPrompt, '你好，私信問你一個問題！');
        assert.equal(receivedUser, 'john_doe');
        assert.ok(replyPayload?.content?.includes('私信回覆：你好呀！'));
    });

    it('falls back to channel.send if message.reply throws in DM', async () => {
        const handler = new AIStreamHandler();
        let fallbackSent = false;
        let finalEdited = false;

        const mockPlaceholder = {
            edit: async () => {
                finalEdited = true;
            }
        };

        const mockUserMessage = {
            guild: null,
            content: '私信測試 fallback',
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            channel: {
                id: 'dm-channel-2',
                sendTyping: async () => {},
                send: async () => {
                    fallbackSent = true;
                    return mockPlaceholder;
                }
            },
            reply: async () => {
                throw new Error('Cannot reply directly in restricted DM');
            },
            author: { id: 'user-dm-2', username: 'alice' },
            mentions: {
                everyone: false,
                has: () => false
            }
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: {
                generateResponse: async () => '回覆成功！'
            }
        };

        const handled = await handler.handle(mockUserMessage, mockBot);
        assert.equal(handled, true);
        assert.equal(fallbackSent, true, 'Should fall back to channel.send when reply throws');
        assert.equal(finalEdited, true, 'Should edit placeholder with final AI response');
    });

    it('processes multiple questions concurrently in the same channel without blocking', async () => {
        const handler = new AIStreamHandler();
        const completionOrder = [];

        const createMockMessage = (content, authorName) => {
            const mockPlaceholder = {
                edit: async () => mockPlaceholder
            };
            return {
                guild: { id: 'guild-1' },
                content,
                attachments: {
                    filter: () => ({ size: 0, values: () => [] })
                },
                channel: {
                    id: 'concurrent-ch-1',
                    sendTyping: async () => {}
                },
                reply: async () => mockPlaceholder,
                author: { id: `u-${authorName}`, username: authorName },
                mentions: { everyone: false, has: () => true }
            };
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: {
                generateResponse: async (prompt) => {
                    if (prompt.includes('慢問題')) {
                        await new Promise((resolve) => setTimeout(resolve, 30));
                        completionOrder.push('慢問題');
                        return '慢問題回答完畢';
                    } else {
                        await new Promise((resolve) => setTimeout(resolve, 5));
                        completionOrder.push('快問題');
                        return '快問題回答完畢';
                    }
                }
            }
        };

        const msg1 = createMockMessage('這是一個慢問題', 'User1');
        const msg2 = createMockMessage('這是一個快問題', 'User2');

        const [res1, res2] = await Promise.all([
            handler.handle(msg1, mockBot),
            handler.handle(msg2, mockBot)
        ]);

        assert.equal(res1, true);
        assert.equal(res2, true);
        // The faster question finishes first concurrently, proving they don't block each other
        assert.deepEqual(completionOrder, ['快問題', '慢問題']);
    });
});
