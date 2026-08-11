const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ReactionRouter = require('../src/core/reactions/ReactionRouter');
const BaseReactionHandler = require('../src/core/reactions/BaseReactionHandler');
const DeleteFixedMessageReactionHandler = require('../src/core/reactions/DeleteFixedMessageReactionHandler');
const RotateProviderReactionHandler = require('../src/core/reactions/RotateProviderReactionHandler');
const LinkFixer = require('../src/core/LinkFixer');

describe('ReactionRouter & Strategy Pattern (Reaction Handlers)', () => {
    it('initializes with default built-in strategies', () => {
        const router = new ReactionRouter();
        assert.equal(router.handlers.length, 2);
        assert.ok(router.handlers[0] instanceof DeleteFixedMessageReactionHandler);
        assert.ok(router.handlers[1] instanceof RotateProviderReactionHandler);
    });

    it('rejects registering non-BaseReactionHandler instances', () => {
        const router = new ReactionRouter();
        assert.throws(() => router.register({}), /must be an instance of BaseReactionHandler/);
    });

    it('returns false for bot user reactions', async () => {
        const router = new ReactionRouter();
        const handled = await router.handle({
            reaction: {},
            user: { bot: true }
        });
        assert.equal(handled, false);
    });

    it('dispatches delete reaction to DeleteFixedMessageReactionHandler', async () => {
        const fixer = new LinkFixer();
        fixer.trackFixedMessage('msg_100', { authorId: 'user_1', fixedLinks: ['https://vxtwitter.com/status/123'] });

        let deleted = false;
        let forgotten = false;

        const mockMessage = {
            id: 'msg_100',
            guild: {
                id: 'guild_1',
                members: {
                    cache: new Map(),
                    fetch: async () => ({ permissions: { has: () => false } })
                }
            },
            delete: async () => { deleted = true; }
        };

        const mockBot = {
            linkFixer: fixer,
            settings: {
                getLinkFixerSettings: () => ({ deleteMsgEmoji: '❌', rotateFixEmoji: '🔄' })
            }
        };

        // Inject custom fixer into handler
        const router = new ReactionRouter([
            new DeleteFixedMessageReactionHandler(fixer)
        ]);

        const handled = await router.handle({
            reaction: { emoji: { name: '❌' }, message: mockMessage },
            user: { id: 'user_1', bot: false },
            bot: mockBot
        });

        assert.equal(handled, true);
        assert.equal(deleted, true);
        assert.equal(fixer.getFixedMessage('msg_100'), undefined);
    });

    it('dispatches rotate reaction to RotateProviderReactionHandler', async () => {
        const fixer = new LinkFixer();
        fixer.trackFixedMessage('msg_200', {
            authorId: 'user_1',
            fixedLinks: ['https://vxtwitter.com/status/123']
        });

        let editedContent = null;
        let reactionRemoved = false;

        const mockMessage = {
            id: 'msg_200',
            guild: { id: 'guild_1' },
            edit: async (data) => { editedContent = data.content; }
        };

        const mockReaction = {
            emoji: { name: '🔄' },
            message: mockMessage,
            users: {
                remove: async () => { reactionRemoved = true; }
            }
        };

        const mockBot = {
            linkFixer: fixer,
            settings: {
                getLinkFixerSettings: () => ({ deleteMsgEmoji: '❌', rotateFixEmoji: '🔄' })
            }
        };

        const router = new ReactionRouter([
            new RotateProviderReactionHandler(fixer)
        ]);

        const handled = await router.handle({
            reaction: mockReaction,
            user: { id: 'user_1', bot: false },
            bot: mockBot
        });

        assert.equal(handled, true);
        assert.equal(editedContent, 'https://xeezz.com/status/123');
        assert.equal(reactionRemoved, true);
        assert.equal(fixer.getFixedMessage('msg_200').fixedLinks[0], 'https://xeezz.com/status/123');
    });
});
