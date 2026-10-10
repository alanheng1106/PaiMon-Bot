import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ILLMProvider from '../src/core/ai/ILLMProvider';
import AIChatSessionManager from '../src/core/ai/AIChatSessionManager';
import ToolRegistry from '../src/core/tools/ToolRegistry';
import BaseTool from '../src/core/tools/BaseTool';
import AIClient from '../src/core/AIClient';

class MockTool extends BaseTool {
    #name;
    #executionCount = 0;

    constructor(name = 'mock_tool') {
        super();
        this.#name = name;
    }

    get executionCount() {
        return this.#executionCount;
    }

    get definition() {
        return {
            type: 'function',
            function: {
                name: this.#name,
                description: 'Mock test tool',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string' }
                    }
                }
            }
        };
    }

    async execute(args) {
        this.#executionCount++;
        return `Result of ${this.#name} with query=${args?.query || ''}`;
    }
}

describe('AIClient Tool Calling & Loop Prevention', () => {
    it('executes tool call and includes tool_name and name in requestMessages', async () => {
        let streamCalls = 0;
        let capturedMessages = [];

        class StepLLMProvider extends ILLMProvider {
            get ready() {
                return true;
            }

            async *chatStream({ messages, tools }) {
                streamCalls++;
                capturedMessages.push([...messages]);

                if (streamCalls === 1) {
                    // Turn 1: AI decides to call mock_tool
                    yield {
                        toolCalls: [
                            {
                                id: 'call_123',
                                function: {
                                    name: 'mock_tool',
                                    arguments: JSON.stringify({ query: 'hello' })
                                }
                            }
                        ]
                    };
                } else {
                    // Turn 2: AI answers with text
                    yield { content: 'Here is the answer based on tool.' };
                }
            }
        }

        const tool = new MockTool('mock_tool');
        const toolRegistry = new ToolRegistry().register(tool);
        const dummyImageService = { ready: true, generateImage: async () => Buffer.from('img') };
        const dummySessionManager = new AIChatSessionManager();

        const client = new AIClient({
            llmProvider: new StepLLMProvider(),
            toolRegistry,
            imageService: dummyImageService,
            sessionManager: dummySessionManager
        });

        const response = await client.generateResponse('Please run mock tool', 'ch-test', 'User');

        assert.equal(response, 'Here is the answer based on tool.');
        assert.equal(tool.executionCount, 1);
        assert.equal(streamCalls, 2);

        // Verify that the tool message sent to LLM in turn 2 contains both tool_name and name
        const turn2Messages = capturedMessages[1];
        const toolMsg = turn2Messages.find((m) => m.role === 'tool');
        assert.ok(toolMsg, 'Tool message must exist in requestMessages');
        assert.equal(toolMsg.name, 'mock_tool');
        assert.equal(toolMsg.tool_name, 'mock_tool');
        assert.equal(toolMsg.tool_call_id, 'call_123');
        assert.ok(toolMsg.content.includes('query=hello'));
    });

    it('forces final textual synthesis when reaching maxToolIterations without crashing', async () => {
        let streamCalls = 0;
        let lastToolsPassed = 'initial';

        class InfiniteToolLoopLLMProvider extends ILLMProvider {
            get ready() {
                return true;
            }

            async *chatStream({ tools }) {
                streamCalls++;
                lastToolsPassed = tools;

                if (tools && tools.length > 0) {
                    // Model keeps asking to call tool as long as tools are provided
                    yield {
                        toolCalls: [
                            {
                                function: {
                                    name: 'mock_tool',
                                    arguments: JSON.stringify({ query: `attempt_${streamCalls}` })
                                }
                            }
                        ]
                    };
                } else {
                    // When tools is undefined (final round forced), model synthesizes final text
                    yield { content: 'Final synthesized answer after reaching limit.' };
                }
            }
        }

        const tool = new MockTool('mock_tool');
        const toolRegistry = new ToolRegistry().register(tool);
        const dummyImageService = { ready: true, generateImage: async () => Buffer.from('img') };
        const dummySessionManager = new AIChatSessionManager();

        const client = new AIClient({
            llmProvider: new InfiniteToolLoopLLMProvider(),
            toolRegistry,
            imageService: dummyImageService,
            sessionManager: dummySessionManager,
            maxToolIterations: 3
        });

        const response = await client.generateResponse('Query that loops', 'ch-loop', 'User');

        // Should complete smoothly without throwing Reached maximum tool execution limit error
        assert.equal(response, 'Final synthesized answer after reaching limit.');
        assert.equal(streamCalls, 3);
        assert.equal(lastToolsPassed, undefined);
    });

    it('detects duplicate identical tool calls in the same turn and avoids infinite tool repetition', async () => {
        let streamCalls = 0;
        let capturedToolResults = [];

        class RepetitiveLLMProvider extends ILLMProvider {
            get ready() {
                return true;
            }

            async *chatStream({ messages, tools }) {
                streamCalls++;
                if (streamCalls === 1) {
                    yield {
                        toolCalls: [
                            {
                                function: {
                                    name: 'mock_tool',
                                    arguments: JSON.stringify({ query: 'same_query' })
                                }
                            }
                        ]
                    };
                } else if (streamCalls === 2) {
                    // LLM repeats the exact same tool call
                    const lastToolMsg = messages[messages.length - 1];
                    capturedToolResults.push(lastToolMsg.content);

                    yield {
                        toolCalls: [
                            {
                                function: {
                                    name: 'mock_tool',
                                    arguments: JSON.stringify({ query: 'same_query' })
                                }
                            }
                        ]
                    };
                } else {
                    const lastToolMsg = messages[messages.length - 1];
                    capturedToolResults.push(lastToolMsg.content);
                    yield { content: 'Finished.' };
                }
            }
        }

        const tool = new MockTool('mock_tool');
        const toolRegistry = new ToolRegistry().register(tool);
        const dummyImageService = { ready: true, generateImage: async () => Buffer.from('img') };
        const dummySessionManager = new AIChatSessionManager();

        const client = new AIClient({
            llmProvider: new RepetitiveLLMProvider(),
            toolRegistry,
            imageService: dummyImageService,
            sessionManager: dummySessionManager
        });

        const response = await client.generateResponse('Repeat query', 'ch-dup', 'User');

        assert.equal(response, 'Finished.');
        // Tool should only have actually been executed once!
        assert.equal(tool.executionCount, 1);
        // The second tool result should contain warning/cached prompt
        assert.ok(capturedToolResults[1].includes('此工具稍早已用相同參數執行過'));
    });

    it('gracefully returns fallback message and delivers attachments when final text is empty', async () => {
        class FileCreatingLLMProvider extends ILLMProvider {
            get ready() {
                return true;
            }

            async *chatStream({ tools }) {
                if (tools) {
                    yield {
                        toolCalls: [
                            {
                                function: {
                                    name: 'create_file',
                                    arguments: JSON.stringify({
                                        filename: 'output.txt',
                                        content: 'Hello File'
                                    })
                                }
                            }
                        ]
                    };
                } else {
                    // Model outputs empty text in final iteration
                    yield { content: '' };
                }
            }
        }

        class MockCreateFileTool extends BaseTool {
            get definition() {
                return {
                    type: 'function',
                    function: {
                        name: 'create_file',
                        parameters: { type: 'object', properties: {} }
                    }
                };
            }

            async execute(args, context) {
                if (!context.attachments) context.attachments = [];
                context.attachments.push({ filename: args.filename, content: args.content });
                return 'File created';
            }
        }

        const toolRegistry = new ToolRegistry().register(new MockCreateFileTool());
        const dummyImageService = { ready: true, generateImage: async () => Buffer.from('img') };
        const dummySessionManager = new AIChatSessionManager();

        const client = new AIClient({
            llmProvider: new FileCreatingLLMProvider(),
            toolRegistry,
            imageService: dummyImageService,
            sessionManager: dummySessionManager,
            maxToolIterations: 2
        });

        const result = await client.generateResponse('Make a file', 'ch-attach', 'User');

        assert.ok(typeof result === 'object' && result !== null);
        assert.equal(result.text, '已完成相關工具操作並生成檔案。');
        assert.equal(result.attachments.length, 1);
        assert.equal(result.attachments[0].filename, 'output.txt');
    });

    it('correctly parses and sanitizes DeepSeek DSML tool arguments', async () => {
        let capturedQuery = '';

        class DSMLTool extends BaseTool {
            get definition() {
                return {
                    type: 'function',
                    function: {
                        name: 'web_search',
                        parameters: { type: 'object', properties: { query: { type: 'string' } } }
                    }
                };
            }

            async execute(args) {
                capturedQuery = args.query;
                return 'Search result for ' + args.query;
            }
        }

        let streamCalls = 0;
        class DSMLLLMProvider extends ILLMProvider {
            get ready() {
                return true;
            }

            async *chatStream() {
                streamCalls++;
                if (streamCalls === 1) {
                    yield {
                        toolCalls: [
                            {
                                id: 'call_dsml_1',
                                function: {
                                    name: 'web_search',
                                    arguments:
                                        '<｜｜DSML｜｜ parameter name="query" string="true">"tdtsum" 是誰 帳號</｜｜DSML｜｜ parameter>'
                                }
                            }
                        ]
                    };
                } else {
                    yield { content: '查詢完成！' };
                }
            }
        }

        const toolRegistry = new ToolRegistry().register(new DSMLTool());
        const client = new AIClient({
            llmProvider: new DSMLLLMProvider(),
            toolRegistry,
            sessionManager: new AIChatSessionManager(),
            maxToolIterations: 3
        });

        const reply = await client.generateResponse('搜尋 tdtsum', 'ch-dsml', 'User');

        assert.equal(capturedQuery, '"tdtsum" 是誰 帳號');
        assert.ok(typeof reply === 'string' && reply.includes('查詢完成！'));
    });
});
