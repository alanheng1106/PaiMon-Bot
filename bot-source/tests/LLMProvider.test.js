const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ILLMProvider = require('../src/core/ai/ILLMProvider');
const OllamaProvider = require('../src/core/ai/OllamaProvider');
const AIClient = require('../src/core/AIClient');

describe('ILLMProvider & OllamaProvider (Strategy Pattern)', () => {
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
        const aiClient = new AIClient({ llmProvider: customProvider });

        assert.equal(aiClient.llmProvider, customProvider);
        assert.equal(aiClient.ready, true);

        let received = '';
        const response = await aiClient.generateResponse('Test prompt', 'ch-1', 'User', (text) => {
            received = text;
        });

        assert.equal(response, 'Hello World!');
    });
});
