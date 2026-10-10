import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Colors } from '../src/config';

const avatarModule = require('../src/commands/general/avatar');
const avatarCommand = avatarModule.default || avatarModule;
const { buildAvatarContainer, normalizeAccentColor, fetchAvatarColor } = avatarModule;

describe('Avatar General Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(avatarCommand.data.name, 'avatar');
        assert.equal(avatarCommand.category, 'general');
        assert.ok(avatarCommand.helpText.includes('/avatar'));
        assert.equal(avatarCommand.data.options.length, 1);
        assert.equal(avatarCommand.data.options[0].name, 'user');
        assert.equal(avatarCommand.data.options[0].required, false);
    });

    describe('normalizeAccentColor', () => {
        it('preserves valid bright colors', () => {
            const hex = '#00AAEE';
            const expected = 0x00aaee;
            assert.equal(normalizeAccentColor(hex), expected);
        });

        it('falls back to Colors.Info for null or undefined', () => {
            assert.equal(normalizeAccentColor(null), Colors.Info);
            assert.equal(normalizeAccentColor(undefined), Colors.Info);
            assert.equal(normalizeAccentColor(''), Colors.Info);
        });

        it('falls back to Colors.Info for invalid hex format', () => {
            assert.equal(normalizeAccentColor('invalid-hex'), Colors.Info);
            assert.equal(normalizeAccentColor('#12345'), Colors.Info);
        });

        it('falls back to Colors.Info for muddy/too-dark colors near dark mode background', () => {
            // Very dark black/grey (#0a0a0a)
            assert.equal(normalizeAccentColor('#0a0a0a'), Colors.Info);
            // Black (#000000)
            assert.equal(normalizeAccentColor('#000000'), Colors.Info);
        });
    });

    describe('buildAvatarContainer', () => {
        const createMockUser = (overrides = {}) => ({
            id: '987654321098765432',
            username: 'paimon_tester',
            globalName: '派蒙測試員',
            avatar: '1234567890abcdef',
            createdTimestamp: 1672531200000,
            displayAvatarURL: ({ extension, forceStatic } = {}) => {
                const ext = extension || (forceStatic === false ? 'webp' : 'png');
                return `https://cdn.discordapp.com/avatars/987654321098765432/1234567890abcdef.${ext}?size=1024`;
            },
            ...overrides
        });

        it('constructs container with Level 1 Heading, metadata subtext (-#), and correct accent color', () => {
            const targetUser = createMockUser();
            const container = buildAvatarContainer({
                targetUser,
                accentColor: 0x00aeec
            });
            const json = container.toJSON();

            assert.equal(json.accent_color, 0x00aeec);

            // Find TextDisplay content
            const textComp = json.components.find((c) => c.type === 10 || c.content);
            assert.ok(textComp, 'Expected TextDisplay component');
            assert.match(textComp.content, /^# 🖼️ 派蒙測試員 的大頭貼/m, 'Must contain Level 1 Markdown Heading (#)');
            assert.match(textComp.content, /-# @paimon_tester • 🆔 `987654321098765432`/, 'Must contain subtext (-#)');
            assert.match(textComp.content, /🖼️ 靜態圖片/, 'Static avatar should indicate static picture');
        });

        it('sets up proper Separator pacing (Small between header and gallery, Large before action buttons)', () => {
            const targetUser = createMockUser();
            const container = buildAvatarContainer({
                targetUser,
                accentColor: Colors.Info
            });
            const json = container.toJSON();

            // Find separators (type 14 or with divider/spacing)
            const separators = json.components.filter((c) => c.type === 14 || typeof c.divider === 'boolean');
            assert.equal(separators.length, 2, 'Should have exactly 2 separators');

            // First separator: Small spacing with divider
            assert.equal(separators[0].spacing, 1, 'First separator should have Small spacing');
            assert.equal(separators[0].divider, true, 'First separator should have divider');

            // Second separator: Large spacing with divider
            assert.equal(separators[1].spacing, 2, 'Second separator should have Large spacing');
            assert.equal(separators[1].divider, true, 'Second separator should have divider');
        });

        it('includes high-resolution MediaGallery and multi-format action buttons for static avatar', () => {
            const targetUser = createMockUser({ avatar: 'static_hash' });
            const container = buildAvatarContainer({
                targetUser,
                accentColor: Colors.Info
            });
            const json = container.toJSON();

            // Media gallery
            const gallery = json.components.find((c) => c.type === 12 || c.items);
            assert.ok(gallery, 'Expected MediaGallery component');
            assert.equal(gallery.items.length, 1);
            assert.ok(gallery.items[0].media.url.includes('size=1024'));

            // Action row buttons
            const actionRow = json.components.find(
                (c) => c.type === 1 || (c.components && c.components[0]?.type === 2)
            );
            assert.ok(actionRow, 'Expected ActionRow component');

            const labels = actionRow.components.map((b) => b.label);
            assert.deepEqual(labels, ['PNG', 'JPG', 'WEBP', '原圖連結']);
        });

        it('includes GIF badge and GIF action button when user avatar is animated', () => {
            const targetUser = createMockUser({
                avatar: 'a_animated_hash',
                displayAvatarURL: ({ extension, forceStatic } = {}) => {
                    const ext = extension || (forceStatic === false ? 'gif' : 'png');
                    return `https://cdn.discordapp.com/avatars/987654321098765432/a_animated_hash.${ext}?size=1024`;
                }
            });
            const container = buildAvatarContainer({
                targetUser,
                accentColor: Colors.Info
            });
            const json = container.toJSON();

            const textComp = json.components.find((c) => c.type === 10 || c.content);
            assert.match(textComp.content, /✨ 動態頭像 \(GIF\)/);

            const actionRow = json.components.find(
                (c) => c.type === 1 || (c.components && c.components[0]?.type === 2)
            );
            const labels = actionRow.components.map((b) => b.label);
            assert.ok(labels.includes('GIF 動圖'), 'Animated avatar must have GIF button');
            assert.equal(labels.length, 5); // PNG, JPG, WEBP, GIF, 原圖連結
        });
    });

    describe('execute interaction lifecycle', () => {
        it('successfully defers reply, builds container, and edits reply with IsComponentsV2 flag', async () => {
            let deferred = false;
            let editedOptions = null;

            const mockTargetUser = {
                id: '111222333444555',
                username: 'alice',
                globalName: 'Alice',
                avatar: 'abc123',
                createdTimestamp: 1670000000000,
                displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/111222333444555/abc123.png?size=1024'
            };

            const mockInteraction = {
                user: { id: 'caller-id' },
                options: {
                    getUser: (optName) => (optName === 'user' ? mockTargetUser : null)
                },
                deferReply: async () => {
                    deferred = true;
                },
                editReply: async (opts) => {
                    editedOptions = opts;
                }
            };

            const mockBot = {
                sendError: async () => {}
            };

            await avatarCommand.execute(mockInteraction, mockBot);

            assert.equal(deferred, true);
            assert.ok(editedOptions);
            assert.ok(editedOptions.components);
            assert.equal(editedOptions.flags, 32768); // MessageFlags.IsComponentsV2
        });

        it('falls back to interaction.user when user option is omitted', async () => {
            let editedOptions = null;

            const mockCallerUser = {
                id: 'self-user-id',
                username: 'bob',
                globalName: 'Bob Self',
                avatar: null,
                createdTimestamp: 1680000000000,
                displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png'
            };

            const mockInteraction = {
                user: mockCallerUser,
                options: {
                    getUser: () => null
                },
                deferReply: async () => {},
                editReply: async (opts) => {
                    editedOptions = opts;
                }
            };

            const mockBot = {
                sendError: async () => {}
            };

            await avatarCommand.execute(mockInteraction, mockBot);

            assert.ok(editedOptions);
            const json = editedOptions.components[0].toJSON();
            const textComp = json.components.find((c) => c.type === 10 || c.content);
            assert.match(textComp.content, /Bob Self/);
        });

        it('catches and reports unexpected exceptions cleanly via bot.sendError', async () => {
            let sentError = null;

            const mockInteraction = {
                user: { id: 'user-err' },
                options: {
                    getUser: () => {
                        throw new Error('Discord API connection dropped');
                    }
                },
                deferReply: async () => {}
            };

            const mockBot = {
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };

            await avatarCommand.execute(mockInteraction, mockBot);

            assert.ok(sentError);
            assert.equal(sentError.title, '查詢失敗');
            assert.equal(sentError.desc, '無法取得使用者大頭貼，請稍後再試。');
        });
    });
});
