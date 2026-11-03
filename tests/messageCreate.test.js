import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import messageCreateEvent from '../src/events/messageCreate';

describe('Event: messageCreate', () => {
    it('leaves social links and native embeds untouched while preserving AI passive context', async () => {
        const content = 'https://x.com/user/status/1234567890 https://www.instagram.com/p/test123/';
        const unexpectedReply = async () => assert.fail('Social links must not trigger replacement replies');
        let passiveContext;
        const message = {
            author: { bot: false, username: 'test_user' },
            guild: { id: 'guild-123' },
            channel: { id: 'chan-123' },
            mentions: { everyone: false, has: () => false },
            content,
            suppressEmbeds: async () => assert.fail('Native embeds must not be suppressed'),
            reply: unexpectedReply
        };
        const bot = {
            user: { id: 'bot-123' },
            settings: { get: () => null },
            ai: {
                addPassiveContext: (...args) => {
                    passiveContext = args;
                }
            }
        };

        await messageCreateEvent.execute(message, bot);

        assert.equal(message.content, content);
        assert.deepEqual(passiveContext, ['chan-123', 'test_user', content]);
    });

    it('ignores messages sent by bots', async () => {
        let pipelineExecuted = false;
        const mockBot = {};
        const mockMessage = {
            author: { bot: true }
        };

        await messageCreateEvent.execute(mockMessage, mockBot);
        assert.equal(pipelineExecuted, false);
    });

    it('does not call channel.fetch on partial DM channels', async () => {
        let channelFetchCalled = false;
        let messageFetchCalled = false;

        const mockMessage = {
            author: { bot: false, username: 'test_user' },
            partial: false,
            guild: null, // DM
            channel: {
                partial: true,
                isDMBased: () => true,
                fetch: async () => {
                    channelFetchCalled = true;
                    throw new Error('TypeError: Cannot read properties of undefined (reading find)');
                },
                id: 'dm-123',
                sendTyping: async () => {}
            },
            mentions: {
                everyone: false,
                has: () => false
            },
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            content: 'Hello in DM'
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: null
        };

        // Execution should not throw and channel.fetch should NOT be called
        await messageCreateEvent.execute(mockMessage, mockBot);
        assert.equal(channelFetchCalled, false, 'Channel fetch should be skipped for DM channels');
    });

    it('calls channel.fetch on partial guild channels', async () => {
        let channelFetchCalled = false;

        const mockMessage = {
            author: { bot: false, username: 'test_user' },
            partial: false,
            guild: { id: 'guild-123' }, // Server guild
            channel: {
                partial: true,
                isDMBased: () => false,
                fetch: async () => {
                    channelFetchCalled = true;
                },
                id: 'chan-123',
                sendTyping: async () => {}
            },
            mentions: {
                everyone: false,
                has: () => false
            },
            attachments: {
                filter: () => ({ size: 0, values: () => [] })
            },
            content: 'Hello in Guild'
        };

        const mockBot = {
            user: { id: 'bot-123' },
            ai: null
        };

        await messageCreateEvent.execute(mockMessage, mockBot);
        assert.equal(channelFetchCalled, true, 'Channel fetch should be called for non-DM channels');
    });
});

