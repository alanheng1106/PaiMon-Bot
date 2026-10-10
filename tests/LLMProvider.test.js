import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ILLMProvider from '../src/core/ai/ILLMProvider';
import AIChatSessionManager from '../src/core/ai/AIChatSessionManager';
import ToolRegistry from '../src/core/tools/ToolRegistry';
import AIClient from '../src/core/AIClient';

describe('ILLMProvider (Strategy Pattern)', () => {
    class MockLLMProvider extends ILLMProvider {
        get ready() {
            return true;
        }

        async *chatStream({ model, messages }) {
            yield { content: 'Hello ' };
            yield { content: 'World!' };
        }
    }

    it('rejects default abstract ILLMProvider chatStream call', async () => {
        const provider = new ILLMProvider();
        assert.equal(provider.ready, false);

        const gen = provider.chatStream({});
        await assert.rejects(async () => {
            await gen.next();
        }, /must be implemented/);
    });

    it('injects custom ILLMProvider strategy into AIClient seamlessly', async () => {
        const customProvider = new MockLLMProvider();
        const dummyImageService = { ready: true, generateImage: async () => Buffer.from('img') };
        const dummySessionManager = new AIChatSessionManager();
        const dummyToolRegistry = new ToolRegistry();

        const aiClient = new AIClient({
            llmProvider: customProvider,
            imageService: dummyImageService,
            sessionManager: dummySessionManager,
            toolRegistry: dummyToolRegistry
        });

        assert.equal(aiClient.llmProvider, customProvider);
        // ready now requires both llm AND image to be ready
        assert.equal(aiClient.ready, true);

        let received = '';
        const response = await aiClient.generateResponse('Test prompt', 'ch-1', 'User', (text) => {
            received = text;
        });

        assert.equal(response, 'Hello World!');
    });
});
