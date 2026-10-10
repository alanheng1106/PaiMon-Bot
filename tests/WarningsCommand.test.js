import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { PermissionFlagsBits } = require('discord.js');

const warningsCommand = require('../src/commands/admin/warnings').default || require('../src/commands/admin/warnings');

describe('Warnings Admin Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(warningsCommand.data.name, 'warnings');
        assert.equal(warningsCommand.data.dm_permission, false);
        assert.equal(warningsCommand.data.default_member_permissions, PermissionFlagsBits.ModerateMembers.toString());
        assert.equal(warningsCommand.category, 'admin');

        const userOption = warningsCommand.data.options.find((opt) => opt.name === 'user');
        assert.ok(userOption);
        assert.equal(userOption.required, true);
    });

    it('rejects execution outside cached guild', async () => {
        let sentError = null;
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => false
        };

        await warningsCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '無法執行');
    });

    it('returns empty notice when user has no warning records', async () => {
        let sentSuccess = null;
        const mockBot = {
            settings: {
                get: () => ({})
            },
            sendSuccess: async (interaction, title, desc, ephemeral) => {
                sentSuccess = { title, desc, ephemeral };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            options: {
                getUser: () => ({ id: 'user-1', tag: 'CleanUser#0001' })
            },
            guild: { id: 'guild-1' }
        };

        await warningsCommand.execute(mockInteraction, mockBot);
        assert.ok(sentSuccess);
        assert.equal(sentSuccess.title, '📋 警告記錄');
        assert.match(sentSuccess.desc, /目前沒有任何警告記錄/);
        assert.equal(sentSuccess.ephemeral, true);
    });

    it('displays warning records with formatted dates, reasons, and tags', async () => {
        let repliedPayload = null;
        const warningsList = [
            { reason: '違規發言', timestamp: '2026-01-01T12:00:00.000Z', by: 'Admin#0001' },
            { reason: '洗版刷屏', timestamp: '2026-02-01T12:00:00.000Z', by: 'Mod#0002' }
        ];

        const mockBot = {
            settings: {
                get: () => ({ 'user-1': warningsList })
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            options: {
                getUser: () => ({
                    id: 'user-1',
                    tag: 'BadUser#0001',
                    displayAvatarURL: () => 'https://example.com/avatar.png'
                })
            },
            guild: { id: 'guild-1' },
            reply: async (payload) => {
                repliedPayload = payload;
            }
        };

        await warningsCommand.execute(mockInteraction, mockBot);
        assert.ok(repliedPayload);
        assert.ok(repliedPayload.components);

        const containerJson = repliedPayload.components[0].toJSON();
        assert.equal(containerJson.type, 17);
        assert.equal(containerJson.accent_color, 0xf1c40f);
        assert.match(containerJson.components[0].content, /# 📋 成員處分檔案/);

        const section = containerJson.components.find((c) => c.type === 9);
        assert.ok(section);
        assert.match(section.components[0].content, /<@user-1>/);
        assert.match(section.components[2].content, /> \*\*處分狀態\*\*：`2 次警告`/);

        const timeline = containerJson.components.find((c) => c.content?.includes('歷史警告記錄'));
        assert.ok(timeline);
        assert.match(timeline.content, /違規發言/);
        assert.match(timeline.content, /洗版刷屏/);

        const actionRow = containerJson.components.find((c) => c.type === 1);
        assert.ok(actionRow);
        assert.equal(actionRow.components[0].custom_id, 'mod:timeout:user-1:600');
        assert.equal(actionRow.components[1].custom_id, 'mod:clearwarns:user-1');
    });

    it('truncates to last 10 warnings and truncates overly long reasons safely', async () => {
        let repliedPayload = null;
        const longReason = 'A'.repeat(200);
        const warningsList = Array.from({ length: 15 }, (_, i) => ({
            reason: i === 14 ? longReason : `警告原因 #${i + 1}`,
            timestamp: '2026-03-01T12:00:00.000Z',
            by: `Admin#${i + 1}`
        }));

        const mockBot = {
            settings: {
                get: () => ({ 'user-1': warningsList })
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            user: { id: 'admin-1', tag: 'ModLeader#0001' },
            options: {
                getUser: () => ({
                    id: 'user-1',
                    tag: 'RepeatOffender#0001',
                    displayAvatarURL: () => 'https://example.com/avatar.png'
                })
            },
            guild: { id: 'guild-1' },
            reply: async (payload) => {
                repliedPayload = payload;
            }
        };

        await warningsCommand.execute(mockInteraction, mockBot);
        assert.ok(repliedPayload);
        assert.ok(repliedPayload.components);

        const containerJson = repliedPayload.components[0].toJSON();
        // 15 warnings >= 3 threshold: escalates to red
        assert.equal(containerJson.accent_color, 0xda373c);
        assert.match(containerJson.components[0].content, /# 📋 成員處分檔案/);

        const timeline = containerJson.components.find((c) => c.content?.includes('歷史警告記錄'));
        assert.ok(timeline);
        assert.match(timeline.content, /顯示最近 10 筆/);
        // Truncated long reason ends with ellipsis
        assert.match(timeline.content, /\.\.\./);

        // Escalated actionRow includes ban button
        const actionRow = containerJson.components.find((c) => c.type === 1);
        assert.ok(actionRow);
        assert.equal(actionRow.components.length, 3);
        assert.equal(actionRow.components[1].custom_id, 'mod:ban:user-1');
    });

    it('catches and handles unexpected exceptions cleanly', async () => {
        let sentError = null;
        const mockBot = {
            settings: {
                get: () => {
                    throw new Error('Database read failure');
                }
            },
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const mockInteraction = {
            inCachedGuild: () => true,
            options: {
                getUser: () => ({ id: 'user-1', tag: 'User#0001' })
            },
            guild: { id: 'guild-1' }
        };

        await warningsCommand.execute(mockInteraction, mockBot);
        assert.ok(sentError);
        assert.equal(sentError.title, '執行失敗');
        assert.match(sentError.desc, /查詢警告記錄時出了點問題/);
    });
});
