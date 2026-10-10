import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import DiscordStreamUpdater from '../src/core/ai/DiscordStreamUpdater';

describe('DiscordStreamUpdater (Safe Streaming Message Edit Queue)', () => {
    class MockMessage {
        constructor() {
            this.edits = [];
        }
        async edit(payload) {
            this.edits.push(payload.content);
            return this;
        }
    }

    it('buffers updates and edits message cleanly', async () => {
        const mockMsg = new MockMessage();
        const updater = new DiscordStreamUpdater(mockMsg, 50);

        await updater.push('Hello');
        await updater.push('Hello world');

        // Wait for throttled flush
        await new Promise((res) => setTimeout(res, 100));

        assert.ok(mockMsg.edits.length >= 1);
        assert.ok(mockMsg.edits[mockMsg.edits.length - 1].includes('Hello world'));
    });

    it('finalizes message without typing indicator suffix', async () => {
        const mockMsg = new MockMessage();
        const updater = new DiscordStreamUpdater(mockMsg, 50);

        await updater.push('Draft text');
        await updater.finalize('Final polished text');

        assert.equal(mockMsg.edits[mockMsg.edits.length - 1], 'Final polished text');
    });

    it('splits oversized messages exceeding 1950 characters cleanly', () => {
        const paragraph = 'This is a test paragraph that should be formatted cleanly.\n\n';
        const longText = paragraph.repeat(40); // > 2000 chars

        const chunks = DiscordStreamUpdater.splitMessage(longText, 500);
        assert.ok(chunks.length > 1);
        for (const chunk of chunks) {
            assert.ok(chunk.length <= 500);
        }
    });

    it('chains follow-up messages using message.reply to link previous message', async () => {
        const repliedMessages = [];
        const createMock = (id) => ({
            id,
            edits: [],
            reply: async (payload) => {
                repliedMessages.push({ parentId: id, content: payload.content });
                return createMock(`msg-${repliedMessages.length}`);
            },
            edit: async (payload) => {
                return createMock(id);
            }
        });

        const rootMsg = createMock('root-msg');
        const updater = new DiscordStreamUpdater(rootMsg, 50);
        const paragraph = 'A long detailed sentence with important facts. ';
        const longText = paragraph.repeat(60); // ~2800 chars

        await updater.finalize(longText);

        assert.ok(repliedMessages.length >= 1);
        assert.equal(repliedMessages[0].content.includes('接續前文'), false, 'Must not contain continuation notice');
        assert.ok(repliedMessages[0].content.includes('sentence with important facts'));
        assert.equal(repliedMessages[0].parentId, 'root-msg');
    });

    it('preserves and re-opens markdown codeblocks across split chunks', () => {
        const longCode = 'console.log("line");\n'.repeat(60);
        const markdown = `Here is some code:\n\`\`\`javascript\n${longCode}\`\`\`\nDone.`;

        const chunks = DiscordStreamUpdater.splitMessage(markdown, 400);
        assert.ok(chunks.length > 1);

        // First chunk should have closed the opened codeblock
        assert.ok(chunks[0].includes('```javascript'));
        assert.ok(chunks[0].endsWith('```'));

        // Second chunk should have reopened the codeblock with language
        assert.ok(chunks[1].startsWith('```javascript'));
    });
});
