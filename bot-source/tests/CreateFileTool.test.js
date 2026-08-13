const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const CreateFileTool = require('../src/core/tools/CreateFileTool');

describe('CreateFileTool (Strategy Pattern for File Generation)', () => {
    it('defines valid tool schema for LLM function calling', () => {
        const tool = new CreateFileTool();
        const def = tool.definition;
        assert.equal(def.type, 'function');
        assert.equal(def.function.name, 'create_file');
        assert.ok(def.function.parameters.properties.filename);
        assert.ok(def.function.parameters.properties.content);
    });

    it('collects attachment descriptor into execution context', async () => {
        const tool = new CreateFileTool();
        const context = {};
        const result = await tool.execute({
            filename: 'choice_bot.py',
            content: 'import discord\nprint("Hello")'
        }, context);

        assert.ok(result.includes('choice_bot.py'));
        assert.equal(context.attachments.length, 1);
        assert.equal(context.attachments[0].filename, 'choice_bot.py');
        assert.equal(context.attachments[0].content, 'import discord\nprint("Hello")');
    });

    it('sanitizes unsafe filename characters', async () => {
        const tool = new CreateFileTool();
        const context = {};
        await tool.execute({
            filename: '../dangerous/test?.py',
            content: 'test'
        }, context);

        assert.equal(context.attachments[0].filename, '.._dangerous_test_.py');
    });
});
