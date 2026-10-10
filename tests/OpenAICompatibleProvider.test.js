import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import OpenAICompatibleProvider from '../src/core/ai/OpenAICompatibleProvider';

describe('OpenAICompatibleProvider (Strategy Pattern for OpenAI API)', () => {
    it('initializes in not ready state when baseURL is missing', () => {
        const provider = new OpenAICompatibleProvider({ baseURL: '' });
        assert.equal(provider.ready, false);
        assert.equal(provider.baseURL, '');
    });

    it('initializes ready state when baseURL is provided', () => {
        const provider = new OpenAICompatibleProvider({
            baseURL: 'http://127.0.0.1:8000/v1',
            apiKey: 'sk-test-token',
            name: 'Windowsed AI Gateway'
        });
        assert.equal(provider.ready, true);
        assert.equal(provider.baseURL, 'http://127.0.0.1:8000/v1');
        assert.equal(provider.name, 'Windowsed AI Gateway');
    });

    it('formats user messages with base64 images into OpenAI image_url format', () => {
        const provider = new OpenAICompatibleProvider({
            baseURL: 'http://127.0.0.1:8000/v1'
        });

        const rawMessages = [
            { role: 'system', content: 'You are helpful' },
            {
                role: 'user',
                content: 'Describe this image',
                images: ['base64_data_12345']
            },
            {
                role: 'tool',
                name: 'calculator',
                content: '42'
            }
        ];

        const formatted = provider.formatMessages(rawMessages);

        assert.equal(formatted.length, 3);
        assert.equal(formatted[0].role, 'system');
        assert.equal(formatted[0].content, 'You are helpful');

        // User message should have content array with text and image_url
        assert.equal(formatted[1].role, 'user');
        assert.ok(Array.isArray(formatted[1].content));
        assert.equal(formatted[1].content[0].type, 'text');
        assert.equal(formatted[1].content[0].text, 'Describe this image');
        assert.equal(formatted[1].content[1].type, 'image_url');
        assert.equal(formatted[1].content[1].image_url.url, 'data:image/jpeg;base64,base64_data_12345');

        // Tool message should have role tool and tool_call_id
        assert.equal(formatted[2].role, 'tool');
        assert.equal(formatted[2].tool_call_id, 'tool_call_id');
    });

    it('streams response chunks and parses content & reasoning tokens', async () => {
        // Mock OpenAI Client
        const mockChunks = [
            { choices: [{ delta: { reasoning_content: 'Thinking step 1...' } }] },
            { choices: [{ delta: { reasoning_content: ' Thinking step 2.' } }] },
            { choices: [{ delta: { content: 'Hello ' } }] },
            { choices: [{ delta: { content: 'world!' } }] }
        ];

        const mockClient = {
            chat: {
                completions: {
                    create: async function* () {
                        for (const chunk of mockChunks) {
                            yield chunk;
                        }
                    }
                }
            }
        };

        const provider = new OpenAICompatibleProvider({
            client: mockClient,
            baseURL: 'http://mock-api:8000/v1'
        });

        const stream = provider.chatStream({
            model: 'qwen2.5:32b',
            messages: [{ role: 'user', content: 'Hi' }]
        });

        const results = [];
        for await (const chunk of stream) {
            results.push(chunk);
        }

        assert.equal(results.length, 4);
        assert.equal(results[0].thinking, 'Thinking step 1...');
        assert.equal(results[1].thinking, ' Thinking step 2.');
        assert.equal(results[2].content, 'Hello ');
        assert.equal(results[3].content, 'world!');
    });

    it('accumulates streaming tool_calls deltas into complete tool calls', async () => {
        const mockToolChunks = [
            {
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    id: 'call_999',
                                    type: 'function',
                                    function: { name: 'calculator', arguments: '{"expr":' }
                                }
                            ]
                        }
                    }
                ]
            },
            {
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    function: { arguments: ' "2+2"}' }
                                }
                            ]
                        }
                    }
                ]
            }
        ];

        const mockClient = {
            chat: {
                completions: {
                    create: async function* () {
                        for (const chunk of mockToolChunks) {
                            yield chunk;
                        }
                    }
                }
            }
        };

        const provider = new OpenAICompatibleProvider({
            client: mockClient,
            baseURL: 'http://mock-api:8000/v1'
        });

        const stream = provider.chatStream({
            model: 'qwen2.5:32b',
            messages: [{ role: 'user', content: 'What is 2+2?' }]
        });

        let lastToolCalls = null;
        for await (const chunk of stream) {
            if (chunk.toolCalls) {
                lastToolCalls = chunk.toolCalls;
            }
        }

        assert.ok(lastToolCalls);
        assert.equal(lastToolCalls.length, 1);
        assert.equal(lastToolCalls[0].id, 'call_999');
        assert.equal(lastToolCalls[0].function.name, 'calculator');
        assert.equal(lastToolCalls[0].function.arguments, '{"expr": "2+2"}');
    });

    it('handles testConnection when baseURL is empty', async () => {
        const provider = new OpenAICompatibleProvider({ baseURL: '' });
        const res = await provider.testConnection();
        assert.equal(res.ok, false);
        assert.ok(res.error?.includes('未設定 API Base URL'));
    });
});
