import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ReactionRouter from '../src/core/reactions/ReactionRouter';
import BaseReactionHandler from '../src/core/reactions/BaseReactionHandler';
import DeleteFixedMessageReactionHandler from '../src/core/reactions/DeleteFixedMessageReactionHandler';
import RotateProviderReactionHandler from '../src/core/reactions/RotateProviderReactionHandler';
import LinkFixer from '../src/core/LinkFixer';

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
            delete: async () => {
                deleted = true;
            }
        };

        const mockBot = {
            linkFixer: fixer,
            settings: {
                getLinkFixerSettings: () => ({ deleteMsgEmoji: '❌', rotateFixEmoji: '🔄' })
            }
        };

        // Inject custom fixer into handler
        const router = new ReactionRouter([new DeleteFixedMessageReactionHandler(fixer)]);

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
            edit: async (data) => {
                editedContent = data.content;
            }
        };

        const mockReaction = {
            emoji: { name: '🔄' },
            message: mockMessage,
            users: {
                remove: async () => {
                    reactionRemoved = true;
                }
            }
        };

        const mockBot = {
            linkFixer: fixer,
            settings: {
                getLinkFixerSettings: () => ({ deleteMsgEmoji: '❌', rotateFixEmoji: '🔄' })
            }
        };

        const router = new ReactionRouter([new RotateProviderReactionHandler(fixer)]);

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

    it('rebuilds Components V2 containers and retains IsComponentsV2 flag when rotating items', async () => {
        const fixer = new LinkFixer();
        fixer.fetchOGMetadata = async () => ({
            title: 'Rotated Tweet',
            description: 'Rotated tweet content',
            siteName: 'Twitter / X'
        });

        const mockItem = {
            originalUrl: 'https://x.com/user/status/123456',
            fixedUrl: 'https://fixupx.com/user/status/123456',
            domainId: 'twitter',
            domainName: 'Twitter / X',
            color: '#1DA1F2',
            providerId: 'fxembed',
            providerName: 'FxEmbed'
        };

        fixer.trackFixedMessage('msg_300', {
            authorId: 'user_1',
            fixedLinks: ['https://fixupx.com/user/status/123456'],
            items: [mockItem]
        });

        let editedPayload = null;
        let reactionRemoved = false;

        const mockMessage = {
            id: 'msg_300',
            guild: { id: 'guild_1' },
            edit: async (payload) => {
                editedPayload = payload;
            }
        };

        const mockReaction = {
            emoji: { name: '🔄' },
            message: mockMessage,
            users: {
                remove: async () => {
                    reactionRemoved = true;
                }
            }
        };

        const mockBot = {
            linkFixer: fixer,
            settings: {
                getLinkFixerSettings: () => ({ deleteMsgEmoji: '❌', rotateFixEmoji: '🔄' })
            }
        };

        const router = new ReactionRouter([new RotateProviderReactionHandler(fixer)]);

        const handled = await router.handle({
            reaction: mockReaction,
            user: { id: 'user_1', bot: false },
            bot: mockBot
        });

        assert.equal(handled, true);
        assert.equal(reactionRemoved, true);
        assert.ok(editedPayload);
        assert.ok(editedPayload.components);
        assert.equal(editedPayload.components.length, 1);
        assert.equal(editedPayload.flags, 32768); // MessageFlags.IsComponentsV2
        assert.equal(editedPayload.content, undefined); // Must NOT contain content

        const updatedTracked = fixer.getFixedMessage('msg_300');
        assert.ok(
            updatedTracked.items[0].fixedUrl.includes('vxtwitter.com') ||
                updatedTracked.items[0].fixedUrl.includes('fixvx.com')
        );
    });

    it('ignores rapid concurrent rotation clicks via inFlight lock', async () => {
        const fixer = new LinkFixer();
        fixer.trackFixedMessage('msg_400', {
            authorId: 'user_1',
            fixedLinks: ['https://vxtwitter.com/status/123']
        });

        let editCount = 0;
        let resolveEdit;
        const editPromise = new Promise((resolve) => {
            resolveEdit = resolve;
        });

        const mockMessage = {
            id: 'msg_400',
            guild: { id: 'guild_1' },
            edit: async () => {
                editCount++;
                await editPromise;
            }
        };

        const mockReaction = {
            emoji: { name: '🔄' },
            message: mockMessage,
            users: { remove: async () => {} }
        };

        const mockBot = {
            linkFixer: fixer,
            settings: {
                getLinkFixerSettings: () => ({ deleteMsgEmoji: '❌', rotateFixEmoji: '🔄' })
            }
        };

        const router = new ReactionRouter([new RotateProviderReactionHandler(fixer)]);

        // First click (enters inFlight)
        const p1 = router.handle({ reaction: mockReaction, user: { id: 'user_1', bot: false }, bot: mockBot });
        // Second rapid click on same message (should be locked out)
        const p2 = router.handle({ reaction: mockReaction, user: { id: 'user_1', bot: false }, bot: mockBot });

        resolveEdit();
        await Promise.all([p1, p2]);

        assert.equal(editCount, 1, 'Only one edit should execute due to inFlight concurrency lock');
    });
});
