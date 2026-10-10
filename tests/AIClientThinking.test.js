import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AIClient from '../src/core/AIClient';
import ToolRegistry from '../src/core/tools/ToolRegistry';
import AIChatSessionManager from '../src/core/ai/AIChatSessionManager';
import ILLMProvider from '../src/core/ai/ILLMProvider';

describe('AIClient Thinking Mode & Multi-Turn History Sanitization (Gemma 4 Compliance)', () => {
    class MockThinkingProvider extends ILLMProvider {
        constructor(chunks) {
            super();
            this.chunks = chunks;
            this.lastParams = null;
        }

        get ready() {
            return true;
        }

        async *chatStream(params) {
            this.lastParams = params;
            for (const chunk of this.chunks) {
                yield chunk;
            }
        }
    }

    it('parses Gemma 4 thinking format with thinking completed', () => {
        const client = new AIClient({
            sessionManager: new AIChatSessionManager(),
            toolRegistry: new ToolRegistry()
        });

        const raw = '<|channel>thought\nStep 1: Calculate 2+2=4\nStep 2: Multiply by 2=8\n<channel|>\nThe answer is 8.';
        const result = client.parseThinkingAndContent(raw);

        assert.equal(result.isThinking, false);
        assert.ok(result.thinking.includes('Step 1: Calculate 2+2=4'));
        assert.equal(result.content, 'The answer is 8.');
    });

    it('parses Gemma 4 thinking format while still thinking (no closing tag yet)', () => {
        const client = new AIClient({
            sessionManager: new AIChatSessionManager(),
            toolRegistry: new ToolRegistry()
        });

        const raw = '<|channel>thought\nLet me reason about this problem...';
        const result = client.parseThinkingAndContent(raw);

        assert.equal(result.isThinking, true);
        assert.equal(result.thinking, 'Let me reason about this problem...');
        assert.equal(result.content, '');
    });

    it('parses Gemma 4 thinking format when thinking is disabled (empty thought block)', () => {
        const client = new AIClient({
            sessionManager: new AIChatSessionManager(),
            toolRegistry: new ToolRegistry()
        });

        const raw = '<|channel>thought\n<channel|>\nDirect output without thinking.';
        const result = client.parseThinkingAndContent(raw);

        assert.equal(result.isThinking, false);
        assert.equal(result.thinking, '');
        assert.equal(result.content, 'Direct output without thinking.');
    });

    it('parses standard <think> fallback tags cleanly', () => {
        const client = new AIClient({
            sessionManager: new AIChatSessionManager(),
            toolRegistry: new ToolRegistry()
        });

        const raw = '<think>\nInternal model thoughts\n</think>\nFinal clean text';
        const result = client.parseThinkingAndContent(raw);

        assert.equal(result.isThinking, false);
        assert.equal(result.thinking, 'Internal model thoughts');
        assert.equal(result.content, 'Final clean text');
    });

    it('injects <|think|> into system prompt when prompt requests deep thinking', async () => {
        const mockProvider = new MockThinkingProvider([
            { content: '<|channel>thought\nThinking\n<channel|>\nFinal answer' }
        ]);
        const sessionManager = new AIChatSessionManager();
        const client = new AIClient({
            llmProvider: mockProvider,
            sessionManager,
            toolRegistry: new ToolRegistry()
        });

        await client.generateResponse('請幫我深度思考這個邏輯問題', 'test-channel', 'TestUser');

        assert.ok(mockProvider.lastParams);
        const systemMsg = mockProvider.lastParams.messages.find((m) => m.role === 'system');
        assert.ok(systemMsg);
        assert.ok(systemMsg.content.startsWith('<|think|>'));
    });

    it('strictly conforms to Gemma 4 rule: No Thinking Content in Session History', async () => {
        const mockProvider = new MockThinkingProvider([
            { content: '<|channel>thought\nComplex private steps\n<channel|>\nHello, this is pure answer.' }
        ]);
        const sessionManager = new AIChatSessionManager();
        const client = new AIClient({
            llmProvider: mockProvider,
            sessionManager,
            toolRegistry: new ToolRegistry()
        });

        const response = await client.generateResponse('Hello', 'history-channel', 'User');

        assert.equal(response, 'Hello, this is pure answer.');

        // Verify session history array does NOT contain the thinking tag or content
        const history = sessionManager.ensureSession('history-channel');
        const assistantMsg = history.find((m) => m.role === 'assistant');

        assert.ok(assistantMsg);
        assert.equal(assistantMsg.content, 'Hello, this is pure answer.');
        assert.ok(!assistantMsg.content.includes('<|channel>'));
        assert.ok(!assistantMsg.content.includes('Complex private steps'));
    });

    it('passes think parameter to llmProvider and streams thinking updates to onUpdate callback', async () => {
        const mockProvider = new MockThinkingProvider([
            { thinking: 'Analyzing the user request carefully...' },
            { thinking: ' Concluding that 9.9 is greater than 9.11.' },
            { content: '9.9 比 9.11 大。' }
        ]);
        const sessionManager = new AIChatSessionManager();
        const client = new AIClient({
            llmProvider: mockProvider,
            sessionManager,
            toolRegistry: new ToolRegistry()
        });

        const updates = [];
        const response = await client.generateResponse(
            '請深度思考：9.11 和 9.9 誰比較大？',
            'think-stream-channel',
            'User',
            async (text) => {
                updates.push(text);
            }
        );

        assert.equal(response, '9.9 比 9.11 大。');
        assert.equal(mockProvider.lastParams?.think, true);
        assert.ok(updates.length > 0);
        // Verify at least one update contained the thinking preview format with the loading emoji
        const hasThinkingPreview = updates.some((u) => u.includes('深度推理思考中...') && u.includes('Analyzing'));
        assert.ok(hasThinkingPreview, 'Expected onUpdate to receive thinking preview');
        const hasLoadingEmoji = updates.some((u) => u.includes('<a:loading:1551489203013947422>'));
        assert.ok(hasLoadingEmoji, 'Expected onUpdate to receive loading emoji <a:loading:1551489203013947422>');
    });
});
