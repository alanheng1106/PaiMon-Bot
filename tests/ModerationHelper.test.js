import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const ModerationHelper = require('../src/utils/ModerationHelper').default || require('../src/utils/ModerationHelper');
const { Colors } = require('../src/config');
const { MessageFlags } = require('discord.js');

describe('ModerationHelper — Scheme A (Formal Audit Dossier)', () => {
    const mockUser = {
        id: '123456789012345678',
        username: 'toxic_user',
        tag: 'toxic_user#0000',
        displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/abc.png'
    };

    const mockExecutor = {
        id: '987654321098765432',
        username: 'admin_user',
        tag: 'admin_user#0000'
    };

    it('builds a compliant CV2 container for Ban command with hammer icon', () => {
        const payload = ModerationHelper.buildPunishmentCard({
            title: '成員封鎖處分',
            color: Colors.Punish,
            icon: '🔨',
            user: mockUser,
            executor: mockExecutor,
            reason: '發布廣告及惡意騷擾'
        });

        assert.ok(payload.flags & MessageFlags.IsComponentsV2);
        assert.equal(payload.components.length, 1);

        const container = payload.components[0];
        const json = container.toJSON();

        // 17 = Container
        assert.equal(json.type, 17);
        assert.equal(json.accent_color, Colors.Punish);

        const components = json.components;
        assert.ok(components.length >= 6);

        // 1. Header with title & hammer
        assert.equal(components[0].type, 10);
        assert.match(components[0].content, /### 🔨 成員封鎖處分/);

        // 2. Separator 1 (Small + divider)
        assert.equal(components[1].type, 14);
        assert.equal(components[1].spacing, 1);
        assert.equal(components[1].divider, true);

        // 3. Section with target user info & thumbnail accessory
        assert.equal(components[2].type, 9);
        assert.match(components[2].components[0].content, /<@123456789012345678>/);
        assert.match(components[2].components[0].content, /toxic_user/);
        assert.match(components[2].components[0].content, /-# 🆔 `123456789012345678`/);
        assert.equal(components[2].accessory.type, 11);
        assert.equal(components[2].accessory.media.url, 'https://cdn.discordapp.com/avatars/123/abc.png');

        // 4. Separator 2 (Small + no divider for spacing)
        assert.equal(components[3].type, 14);
        assert.equal(components[3].spacing, 1);
        assert.equal(components[3].divider, false);

        // 5. Reason TextDisplay
        assert.equal(components[4].type, 10);
        assert.match(components[4].content, /\*\*📋 執行原因\*\*\n發布廣告及惡意騷擾/);

        // 6. Separator 3 (Small + divider)
        assert.equal(components[5].type, 14);
        assert.equal(components[5].spacing, 1);
        assert.equal(components[5].divider, true);

        // 7. Metadata Subtext TextDisplay
        assert.equal(components[6].type, 10);
        assert.match(components[6].content, /-# 👮 執行人員：<@987654321098765432>/);
        assert.match(components[6].content, /admin_user/);
        assert.match(components[6].content, /🕒 處分時間：<t:\d+:f>/);
    });

    it('infers correct icons when icon is omitted', () => {
        const kickPayload = ModerationHelper.buildPunishmentCard({
            title: '踢出成功',
            user: mockUser,
            executor: mockExecutor,
            reason: '踢出測試'
        });
        const kickJson = kickPayload.components[0].toJSON();
        assert.match(kickJson.components[0].content, /### 👢 踢出成功/);

        const warnPayload = ModerationHelper.buildPunishmentCard({
            title: '警告已記錄',
            user: mockUser,
            executor: mockExecutor,
            reason: '警告測試'
        });
        const warnJson = warnPayload.components[0].toJSON();
        assert.match(warnJson.components[0].content, /### <a:cross:1524603300752785550> 警告已記錄/);
    });

    it('handles extraFields gracefully', () => {
        const payload = ModerationHelper.buildPunishmentCard({
            title: '禁言成功',
            user: mockUser,
            executor: mockExecutor,
            reason: '語音吵鬧',
            extraFields: ['> **⏱️ 禁言時長**　5 分鐘']
        });
        const json = payload.components[0].toJSON();
        const extraFieldComponent = json.components.find((c) => c.content?.includes('禁言時長'));
        assert.ok(extraFieldComponent);
        assert.match(extraFieldComponent.content, /> \*\*⏱️ 禁言時長\*\*　5 分鐘/);
    });

    it('handles fallback when user has no avatar or tag', () => {
        const bareUser = { id: '99999' };
        const payload = ModerationHelper.buildPunishmentCard({
            title: '封鎖成功',
            user: bareUser,
            executor: mockExecutor,
            reason: '無頭像測試'
        });
        const json = payload.components[0].toJSON();
        const section = json.components.find((c) => c.type === 9);
        assert.ok(section.accessory.media.url);
        assert.match(section.accessory.media.url, /avatars/);
    });

    it('formatAuditReason correctly formats audit string', () => {
        const formatted = ModerationHelper.formatAuditReason(mockExecutor, '違規洗版');
        assert.equal(formatted, 'By admin_user#0000: 違規洗版');
    });

    it('checkBotPermission returns true when bot has permission', async () => {
        const mockInteraction = {
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: (perm) => true
                        }
                    }
                }
            }
        };
        const mockBot = {
            sendError: async () => {}
        };
        const result = await ModerationHelper.checkBotPermission(
            mockInteraction,
            mockBot,
            1n,
            '封鎖成員',
            'Ban Members'
        );
        assert.equal(result, true);
    });

    it('checkBotPermission sends error and returns false when bot lacks permission', async () => {
        let sentError = null;
        const mockInteraction = {
            guild: {
                members: {
                    me: {
                        permissions: {
                            has: (perm) => false
                        }
                    }
                }
            }
        };
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        const result = await ModerationHelper.checkBotPermission(
            mockInteraction,
            mockBot,
            1n,
            '封鎖成員',
            'Ban Members'
        );
        assert.equal(result, false);
        assert.ok(sentError);
        assert.equal(sentError.title, '權限不足');
        assert.match(sentError.desc, /缺少「封鎖成員」\(Ban Members\) 的權限/);
    });

    it('abortWithError deletes deferred reply and sends error', async () => {
        let deleted = false;
        let sentError = null;
        const mockInteraction = {
            deleteReply: async () => {
                deleted = true;
            }
        };
        const mockBot = {
            sendError: async (interaction, title, desc) => {
                sentError = { title, desc };
            }
        };
        await ModerationHelper.abortWithError(mockInteraction, mockBot, '權限受限', '無法操作');
        assert.equal(deleted, true);
        assert.deepEqual(sentError, { title: '權限受限', desc: '無法操作' });
    });

    describe('Scheme B — Actionable Control Receipt (buildActionableBanCard)', () => {
        const mockUserWithCreated = {
            id: '123456789012345678',
            username: 'banned_user',
            tag: 'banned_user#1234',
            createdTimestamp: 1700000000000,
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png'
        };

        it('builds a full Scheme B actionable container with quick unban and history buttons', () => {
            const payload = ModerationHelper.buildActionableBanCard({
                user: mockUserWithCreated,
                executor: mockExecutor,
                reason: '發布有害釣魚連結'
            });

            assert.ok(payload.flags & MessageFlags.IsComponentsV2);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0];
            const json = container.toJSON();

            // 17 = Container
            assert.equal(json.type, 17);
            assert.equal(json.accent_color, 0xda373c);

            const components = json.components;
            assert.equal(components.length, 6);

            // 1. Heading 1 Title (#)
            assert.equal(components[0].type, 10);
            assert.match(components[0].content, /^# 🔨 成員封鎖處分/);

            // 2. Divider after title
            assert.equal(components[1].type, 14);
            assert.equal(components[1].divider, true);

            // 3. Section with user info, timestamp, reason, and avatar thumbnail
            assert.equal(components[2].type, 9);
            assert.match(components[2].components[0].content, /<@123456789012345678>/);
            assert.match(components[2].components[0].content, /banned_user/);
            assert.match(components[2].components[1].content, /帳號建立於 <t:1700000000:R>/);
            assert.match(components[2].components[2].content, /\*\*處分事由\*\*：發布有害釣魚連結/);
            assert.equal(components[2].accessory.type, 11);
            assert.equal(components[2].accessory.media.url, 'https://cdn.discordapp.com/avatars/123/avatar.png');

            // 4. Divider before actions
            assert.equal(components[3].type, 14);
            assert.equal(components[3].divider, true);

            // 5. ActionRow with 2 buttons
            assert.equal(components[4].type, 1);
            const buttons = components[4].components;
            assert.equal(buttons.length, 2);

            // Button 1: Unban
            assert.equal(buttons[0].custom_id, 'mod:unban:123456789012345678');
            assert.equal(buttons[0].label, '撤銷封鎖');
            assert.equal(buttons[0].style, 4); // Danger
            assert.equal(buttons[0].emoji.name, '↩️');

            // Button 2: History
            assert.equal(buttons[1].custom_id, 'mod:history:123456789012345678');
            assert.equal(buttons[1].label, '處分記錄');
            assert.equal(buttons[1].style, 2); // Secondary
            assert.equal(buttons[1].emoji.name, '📜');

            // 6. Footer metadata Subtext
            assert.equal(components[5].type, 10);
            assert.match(components[5].content, /-# 執行人員：<@987654321098765432>  •  處分時間：<t:\d+:R>/);
        });

        it('handles extraFields gracefully in Scheme B', () => {
            const payload = ModerationHelper.buildActionableBanCard({
                user: mockUserWithCreated,
                executor: mockExecutor,
                reason: '違規測試',
                extraFields: ['> 🔍 **案件編號** #BAN-999']
            });

            const json = payload.components[0].toJSON();
            const extraField = json.components.find((c) => c.content?.includes('案件編號'));
            assert.ok(extraField);
            assert.match(extraField.content, /案件編號/);
        });
    });

    describe('buildUnbanCard (Unified Dossier Scheme)', () => {
        const mockUserWithCreated = {
            id: '123456789012345678',
            username: 'unbanned_user',
            tag: 'unbanned_user#1234',
            createdTimestamp: 1700000000000,
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png'
        };

        it('builds a compliant CV2 unban card with Heading 1, avatar section, and footer', () => {
            const payload = ModerationHelper.buildUnbanCard({
                user: mockUserWithCreated,
                executor: mockExecutor,
                reason: '申訴審核通過'
            });

            assert.ok(payload.flags & MessageFlags.IsComponentsV2);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0];
            const json = container.toJSON();

            // 17 = Container
            assert.equal(json.type, 17);
            assert.equal(json.accent_color, Colors.Success);

            const components = json.components;
            assert.equal(components.length, 5);

            // 1. Heading 1 Title (#)
            assert.equal(components[0].type, 10);
            assert.match(components[0].content, /^# 🔓 解除封鎖成功/);

            // 2. Divider after title
            assert.equal(components[1].type, 14);
            assert.equal(components[1].divider, true);

            // 3. Section with user info, timestamp, reason, and avatar thumbnail
            assert.equal(components[2].type, 9);
            assert.match(components[2].components[0].content, /<@123456789012345678>/);
            assert.match(components[2].components[0].content, /unbanned_user/);
            assert.match(components[2].components[1].content, /帳號建立於 <t:1700000000:R>/);
            assert.match(components[2].components[2].content, /\*\*解封事由\*\*：申訴審核通過/);
            assert.equal(components[2].accessory.type, 11);
            assert.equal(components[2].accessory.media.url, 'https://cdn.discordapp.com/avatars/123/avatar.png');

            // 4. Divider before footer
            assert.equal(components[3].type, 14);
            assert.equal(components[3].divider, true);

            // 5. Footer metadata Subtext
            assert.equal(components[4].type, 10);
            assert.match(components[4].content, /-# 執行人員：<@987654321098765432>  •  解封時間：<t:\d+:R>/);
        });

        it('handles default reason and user fallbacks cleanly', () => {
            const bareUser = { id: '888888888' };
            const payload = ModerationHelper.buildUnbanCard({
                user: bareUser,
                executor: mockExecutor
            });

            const json = payload.components[0].toJSON();
            const section = json.components.find((c) => c.type === 9);
            assert.match(section.components[0].content, /未知使用者/);
            assert.match(section.components[2].content, /\*\*解封事由\*\*：未提供原因/);
        });
    });

    describe('Scheme B — Actionable Control Receipt for Kick (buildActionableKickCard)', () => {
        const mockUserWithCreated = {
            id: '123456789012345678',
            username: 'kicked_user',
            tag: 'kicked_user#1234',
            createdTimestamp: 1700000000000,
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png'
        };

        it('builds a full Scheme B actionable container with upgrade to ban and history buttons', () => {
            const payload = ModerationHelper.buildActionableKickCard({
                user: mockUserWithCreated,
                executor: mockExecutor,
                reason: '在語音頻道進行惡意炸房'
            });

            assert.ok(payload.flags & MessageFlags.IsComponentsV2);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0];
            const json = container.toJSON();

            // 17 = Container
            assert.equal(json.type, 17);
            assert.equal(json.accent_color, 0xe67e22);

            const components = json.components;
            assert.equal(components.length, 6);

            // 1. Heading 1 Title (# 👢 成員踢出處分)
            assert.equal(components[0].type, 10);
            assert.match(components[0].content, /^# 👢 成員踢出處分/);

            // 2. Divider after title
            assert.equal(components[1].type, 14);
            assert.equal(components[1].divider, true);

            // 3. Section with user info, timestamp, reason, and avatar thumbnail
            assert.equal(components[2].type, 9);
            assert.match(components[2].components[0].content, /<@123456789012345678>/);
            assert.match(components[2].components[0].content, /kicked_user/);
            assert.match(components[2].components[1].content, /帳號建立於 <t:1700000000:R>/);
            assert.match(components[2].components[2].content, /\*\*處分事由\*\*：在語音頻道進行惡意炸房/);
            assert.equal(components[2].accessory.type, 11);
            assert.equal(components[2].accessory.media.url, 'https://cdn.discordapp.com/avatars/123/avatar.png');

            // 4. Divider before actions
            assert.equal(components[3].type, 14);
            assert.equal(components[3].divider, true);

            // 5. ActionRow with 2 buttons
            assert.equal(components[4].type, 1);
            const buttons = components[4].components;
            assert.equal(buttons.length, 2);

            // Button 1: Upgrade to Ban
            assert.equal(buttons[0].custom_id, 'mod:ban:123456789012345678');
            assert.equal(buttons[0].label, '升級為封鎖');
            assert.equal(buttons[0].style, 4); // Danger
            assert.equal(buttons[0].emoji.name, '🛑');

            // Button 2: History
            assert.equal(buttons[1].custom_id, 'mod:history:123456789012345678');
            assert.equal(buttons[1].label, '處分記錄');
            assert.equal(buttons[1].style, 2); // Secondary
            assert.equal(buttons[1].emoji.name, '📜');

            // 6. Footer metadata Subtext
            assert.equal(components[5].type, 10);
            assert.match(components[5].content, /-# 執行人員：<@987654321098765432>  •  處分時間：<t:\d+:R>/);
        });

        it('handles extraFields and custom color/icon gracefully in Scheme B kick card', () => {
            const payload = ModerationHelper.buildActionableKickCard({
                title: '違規踢出處分',
                icon: '⚡',
                color: 0xf47b67,
                user: mockUserWithCreated,
                executor: mockExecutor,
                reason: '違規測試',
                extraFields: ['> 🔍 **案件編號** #KICK-101']
            });

            const json = payload.components[0].toJSON();
            assert.equal(json.accent_color, 0xf47b67);
            assert.match(json.components[0].content, /^# ⚡ 違規踢出處分/);
            const extraField = json.components.find((c) => c.content?.includes('案件編號'));
            assert.ok(extraField);
            assert.match(extraField.content, /案件編號/);
        });
    });

    describe('ModerationHelper — Scheme B (Actionable Lock Card)', () => {
        const mockChannel = {
            id: '123456789012345678',
            name: 'announcements'
        };

        const mockExecutor = {
            id: '987654321098765432',
            username: 'admin_user',
            tag: 'admin_user#0000'
        };

        const mockGuild = {
            name: 'Gaming Community',
            iconURL: () => 'https://cdn.discordapp.com/icons/guild.png'
        };

        it('builds a compliant CV2 Scheme B container for lock command with Quick Unlock button', () => {
            const payload = ModerationHelper.buildActionableLockCard({
                channel: mockChannel,
                executor: mockExecutor,
                guild: mockGuild,
                reason: '伺服器維護中，暫停發言'
            });

            assert.ok(payload.flags & MessageFlags.IsComponentsV2);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0];
            const json = container.toJSON();

            // Accent color is alert orange 0xe67e22
            assert.equal(json.accent_color, 0xe67e22);

            // 1. Heading 1 with shield
            assert.match(json.components[0].content, /^# 🛡️ 頻道安全管制生效/);

            // 2. Divider line
            assert.equal(json.components[1].type, 14);
            assert.equal(json.components[1].divider, true);

            // 3. Full-width clean channel & reason display (no redundant name, no avatar thumbnail)
            const channelDisplay = json.components.find(
                (c) => c.content && c.content.includes('<#123456789012345678>')
            );
            assert.ok(channelDisplay);
            assert.match(channelDisplay.content, /@everyone/);
            assert.equal(channelDisplay.content.includes('#announcements'), false);
            const reasonDisplay = json.components.find((c) => c.content && c.content.includes('伺服器維護中'));
            assert.ok(reasonDisplay);
            assert.match(reasonDisplay.content, /\*\*鎖定原因\*\*：伺服器維護中，暫停發言/);
            assert.equal(reasonDisplay.content.startsWith('>'), false);

            // 4. ActionRow with Quick Unlock button (Success, 🔓)
            const actionRow = json.components.find((c) => c.type === 1);
            assert.ok(actionRow);
            assert.equal(actionRow.components[0].custom_id, 'mod:unlock:123456789012345678');
            assert.equal(actionRow.components[0].label, '解除頻道鎖定');
            assert.equal(actionRow.components[0].style, 3); // Success
            assert.equal(actionRow.components[0].emoji.name, '🔓');

            // 5. Subtext footer with executor mention and timestamp
            const footer = json.components[json.components.length - 1];
            assert.match(footer.content, /-# 執行人員：<@987654321098765432>  •  鎖定時間：<t:\d+:R>/);
        });

        it('renders vulnerability warning when extraAllowedRoles are provided', () => {
            const payload = ModerationHelper.buildActionableLockCard({
                channel: mockChannel,
                executor: mockExecutor,
                reason: '緊急防刷屏',
                extraAllowedRoles: ['VIP', 'Nitro Boosters']
            });

            const json = payload.components[0].toJSON();
            const warning = json.components.find((c) => c.content?.includes('覆寫例外'));
            assert.ok(warning);
            assert.match(warning.content, /VIP, Nitro Boosters/);
            assert.match(warning.content, /可繞過本次鎖定/);
        });

        it('builds a compliant CV2 Scheme B container for unlock command with Quick Lock button', () => {
            const payload = ModerationHelper.buildActionableUnlockCard({
                channel: mockChannel,
                executor: mockExecutor,
                guild: mockGuild
            });

            assert.ok(payload.flags & MessageFlags.IsComponentsV2);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0];
            const json = container.toJSON();

            // Accent color is success green Colors.Success (0x57f287)
            assert.equal(json.accent_color, Colors.Success);

            // 1. Heading 1 with unlock emoji
            assert.match(json.components[0].content, /^# 🔓 頻道安全管制解除/);

            // 2. Divider line
            assert.equal(json.components[1].type, 14);
            assert.equal(json.components[1].divider, true);

            // 3. Target channel & scope display
            const channelDisplay = json.components.find(
                (c) => c.content && c.content.includes('<#123456789012345678>')
            );
            assert.ok(channelDisplay);
            assert.match(channelDisplay.content, /@everyone/);
            assert.match(channelDisplay.content, /已恢復預設/);

            // 4. Permissions detail display
            const permsDisplay = json.components.find((c) => c.content && c.content.includes('恢復權限明細'));
            assert.ok(permsDisplay);
            assert.match(permsDisplay.content, /發送訊息/);
            assert.match(permsDisplay.content, /討論串/);

            // 5. Heterogeneous boundary divider
            const dividers = json.components.filter((c) => c.type === 14);
            assert.ok(dividers.length >= 2);

            // 6. ActionRow with Quick Re-lock button (Secondary, 🔒)
            const actionRow = json.components.find((c) => c.type === 1);
            assert.ok(actionRow);
            assert.equal(actionRow.components[0].custom_id, 'mod:lock:123456789012345678');
            assert.equal(actionRow.components[0].label, '再次鎖定頻道');
            assert.equal(actionRow.components[0].style, 2); // Secondary
            assert.equal(actionRow.components[0].emoji.name, '🔒');

            // 7. Subtext footer with executor mention and timestamp
            const footer = json.components[json.components.length - 1];
            assert.match(footer.content, /-# 執行人員：<@987654321098765432>  •  解除時間：<t:\d+:R>/);
        });
    });

    describe('Scheme B — Actionable Control Console (buildActionableTimeoutCard)', () => {
        const mockUserWithCreated = {
            id: '123456789012345678',
            username: 'toxic_chatter',
            tag: 'toxic_chatter#5678',
            createdTimestamp: 1700000000000,
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png'
        };

        it('builds a full Scheme B actionable timeout card with orange accent and untimeout/history buttons', () => {
            const payload = ModerationHelper.buildActionableTimeoutCard({
                user: mockUserWithCreated,
                executor: mockExecutor,
                durationSeconds: 600,
                durationLabel: '10 分鐘',
                reason: '洗版與言語攻擊',
                isUntimeout: false
            });

            assert.ok(payload.flags & MessageFlags.IsComponentsV2);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0];
            const json = container.toJSON();

            // 17 = Container
            assert.equal(json.type, 17);
            assert.equal(json.accent_color, 0xe67e22);

            const components = json.components;
            assert.equal(components.length, 7);

            // 1. Heading 1 Title (#)
            assert.equal(components[0].type, 10);
            assert.match(components[0].content, /^# ⏳ 成員禁言處分/);

            // 2. Divider after title
            assert.equal(components[1].type, 14);
            assert.equal(components[1].divider, true);

            // 3. Section with 3 TextDisplays and thumbnail accessory
            assert.equal(components[2].type, 9);
            assert.equal(components[2].components.length, 3);
            assert.match(components[2].components[0].content, /<@123456789012345678>/);
            assert.match(components[2].components[0].content, /toxic_chatter/);
            assert.match(components[2].components[1].content, /帳號建立於 <t:1700000000:R>/);
            assert.match(components[2].components[2].content, /\*\*⏱️ 禁言時長\*\*：`10 分鐘`/);
            assert.match(components[2].components[2].content, /預計於 <t:\d+:R> 解除/);
            assert.equal(components[2].accessory.type, 11);
            assert.equal(components[2].accessory.media.url, 'https://cdn.discordapp.com/avatars/123/avatar.png');

            // 4. Reason display (full-width)
            assert.equal(components[3].type, 10);
            assert.match(components[3].content, /\*\*處分事由\*\*：洗版與言語攻擊/);

            // 5. Divider before actions
            assert.equal(components[4].type, 14);
            assert.equal(components[4].divider, true);

            // 6. ActionRow with untimeout and history buttons
            assert.equal(components[5].type, 1);
            const buttons = components[5].components;
            assert.equal(buttons.length, 2);

            // Button 1: Untimeout (Success, 3)
            assert.equal(buttons[0].custom_id, 'mod:untimeout:123456789012345678');
            assert.equal(buttons[0].label, '提前解除禁言');
            assert.equal(buttons[0].style, 3); // Success
            assert.equal(buttons[0].emoji.name, '🔓');

            // Button 2: History (Secondary, 2)
            assert.equal(buttons[1].custom_id, 'mod:history:123456789012345678');
            assert.equal(buttons[1].label, '處分記錄');
            assert.equal(buttons[1].style, 2); // Secondary
            assert.equal(buttons[1].emoji.name, '📜');

            // 7. Footer subtext
            assert.equal(components[6].type, 10);
            assert.match(components[6].content, /-# 執行人員：<@987654321098765432>  •  處分時間：<t:\d+:R>/);
        });

        it('builds a full Scheme B actionable card for untimeout with green accent and re-timeout button', () => {
            const payload = ModerationHelper.buildActionableTimeoutCard({
                user: mockUserWithCreated,
                executor: mockExecutor,
                durationSeconds: 0,
                durationLabel: '解除禁言',
                reason: '態度良好提前解禁',
                isUntimeout: true
            });

            const json = payload.components[0].toJSON();
            assert.equal(json.accent_color, Colors.Success);

            const components = json.components;
            // Title
            assert.match(components[0].content, /^# 🔓 解除禁言生效/);

            // Section text line 3 indicates restored status
            assert.match(components[2].components[2].content, /\*\*當前狀態\*\*：`發言許可已恢復`/);

            // Reason
            assert.match(components[3].content, /\*\*解禁事由\*\*：態度良好提前解禁/);

            // ActionRow
            const buttons = components[5].components;
            assert.equal(buttons[0].custom_id, 'mod:timeout:123456789012345678:600');
            assert.equal(buttons[0].label, '重新禁言 10 分鐘');
            assert.equal(buttons[0].style, 2); // Secondary
            assert.equal(buttons[0].emoji.name, '⏳');

            // Footer
            assert.match(components[6].content, /解禁時間：<t:\d+:R>/);
        });

        it('auto-resolves isUntimeout from durationSeconds 0 when isUntimeout is omitted', () => {
            const payload = ModerationHelper.buildActionableTimeoutCard({
                user: { id: '55555' },
                executor: mockExecutor,
                durationSeconds: 0
            });
            const json = payload.components[0].toJSON();
            assert.equal(json.accent_color, Colors.Success);
            assert.match(json.components[0].content, /解除禁言生效/);
        });
    });

    describe('Scheme B — Actionable Control Receipt for Warn (buildActionableWarnCard)', () => {
        const mockUserWithCreated = {
            id: '123456789012345678',
            username: 'warned_user',
            tag: 'warned_user#1234',
            createdTimestamp: 1700000000000,
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png'
        };

        it('builds a compliant Scheme B warn card with amber yellow accent, 3-line section, and history button for low count', () => {
            const payload = ModerationHelper.buildActionableWarnCard({
                user: mockUserWithCreated,
                executor: mockExecutor,
                reason: '洗版干擾聊天',
                warnCount: 1
            });

            assert.ok(payload.flags & MessageFlags.IsComponentsV2);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0];
            const json = container.toJSON();

            // Container type 17
            assert.equal(json.type, 17);
            // Default amber yellow accent color
            assert.equal(json.accent_color, 0xf1c40f);

            const components = json.components;
            assert.equal(components.length, 7);

            // 1. Heading 1 Title (#)
            assert.equal(components[0].type, 10);
            assert.match(components[0].content, /^# <a:cross:1524603300752785550> 成員警告處分/);

            // 2. Divider after title
            assert.equal(components[1].type, 14);
            assert.equal(components[1].divider, true);

            // 3. Section with 3 TextDisplays and thumbnail accessory
            assert.equal(components[2].type, 9);
            assert.equal(components[2].components.length, 3);
            assert.match(components[2].components[0].content, /<@123456789012345678>/);
            assert.match(components[2].components[0].content, /warned_user/);
            assert.match(components[2].components[1].content, /帳號建立於 <t:1700000000:R>/);
            assert.match(
                components[2].components[2].content,
                /\*\*警告狀態\*\*：\[ <a:cross:1524603300752785550>⚪⚪ \] `1 次`/
            );
            assert.equal(components[2].accessory.type, 11);
            assert.equal(components[2].accessory.media.url, 'https://cdn.discordapp.com/avatars/123/avatar.png');

            // 4. Reason display (full-width, no blockquote >)
            assert.equal(components[3].type, 10);
            assert.match(components[3].content, /\*\*處分事由\*\*：洗版干擾聊天/);
            assert.equal(components[3].content.startsWith('>'), false);

            // 5. Divider before actions
            assert.equal(components[4].type, 14);
            assert.equal(components[4].divider, true);

            // 6. ActionRow with single history button (not escalated yet)
            assert.equal(components[5].type, 1);
            const buttons = components[5].components;
            assert.equal(buttons.length, 1);
            assert.equal(buttons[0].custom_id, 'mod:history:123456789012345678');
            assert.equal(buttons[0].label, '處分記錄');
            assert.equal(buttons[0].style, 2); // Secondary
            assert.equal(buttons[0].emoji.name, '📜');

            // 7. Subtext footer
            assert.equal(components[6].type, 10);
            assert.match(components[6].content, /-# 執行人員：<@987654321098765432>  •  記錄時間：<t:\d+:R>/);
        });

        it('escalates accent color to alert red and adds timeout escalation button when warnCount reaches threshold', () => {
            const payload = ModerationHelper.buildActionableWarnCard({
                user: mockUserWithCreated,
                executor: mockExecutor,
                reason: '屢次洗版屢勸不聽',
                warnCount: 3
            });

            const json = payload.components[0].toJSON();
            // Accent color escalates to red
            assert.equal(json.accent_color, 0xed4245);

            const components = json.components;
            // Section Line 3 has full warning meter and threshold reached indicator
            assert.match(
                components[2].components[2].content,
                /\*\*警告狀態\*\*：\[ (?:<a:cross:1524603300752785550>){3} \] `3 次` \(已達處分門檻\)/
            );

            // ActionRow contains both history button and timeout escalation button
            const actionRow = components[5];
            assert.equal(actionRow.type, 1);
            const buttons = actionRow.components;
            assert.equal(buttons.length, 2);

            // Button 1: History
            assert.equal(buttons[0].custom_id, 'mod:history:123456789012345678');
            assert.equal(buttons[0].label, '處分記錄');
            assert.equal(buttons[0].style, 2); // Secondary
            assert.equal(buttons[0].emoji.name, '📜');

            // Button 2: Timeout escalation
            assert.equal(buttons[1].custom_id, 'mod:timeout:123456789012345678:600');
            assert.equal(buttons[1].label, '升級禁言 10 分鐘');
            assert.equal(buttons[1].style, 4); // Danger
            assert.equal(buttons[1].emoji.name, '⏳');
        });

        it('handles custom maxThreshold and extraFields gracefully', () => {
            const payload = ModerationHelper.buildActionableWarnCard({
                user: mockUserWithCreated,
                executor: mockExecutor,
                reason: '惡意張貼連結',
                warnCount: 2,
                maxThreshold: 5,
                extraFields: ['> 🔍 **案件編號** #WARN-042']
            });

            const json = payload.components[0].toJSON();
            // Not escalated because 2 < 5
            assert.equal(json.accent_color, 0xf1c40f);

            // Meter has 2 warnings and 3 white circles (total 5)
            assert.match(
                json.components[2].components[2].content,
                /\*\*警告狀態\*\*：\[ (?:<a:cross:1524603300752785550>){2}⚪⚪⚪ \] `2 次`/
            );

            // Extra field present
            const extra = json.components.find((c) => c.content?.includes('案件編號'));
            assert.ok(extra);
            assert.match(extra.content, /#WARN-042/);

            // Only 1 button because not escalated
            const actionRow = json.components.find((c) => c.type === 1);
            assert.equal(actionRow.components.length, 1);
        });

        it('handles fallback when user has no avatar or tag', () => {
            const bareUser = { id: '777777777777777777' };
            const payload = ModerationHelper.buildActionableWarnCard({
                user: bareUser,
                executor: mockExecutor,
                reason: '無標籤使用者測試',
                warnCount: 1
            });

            const json = payload.components[0].toJSON();
            const section = json.components.find((c) => c.type === 9);
            assert.match(section.components[0].content, /未知使用者/);
            assert.ok(section.accessory.media.url);
            assert.match(section.accessory.media.url, /avatars/);
        });
    });

    describe('ModerationHelper — buildActionableWarningsCard (Scheme B — Actionable Mod Console)', () => {
        const mockUserWithCreated = {
            id: '123456789012345678',
            username: 'bad_user',
            tag: 'bad_user#0001',
            createdTimestamp: 1700000000000,
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png'
        };

        const mockExecutor = {
            id: '987654321098765432',
            username: 'admin_user',
            tag: 'admin_user#0000'
        };

        it('builds compliant CV2 actionable warnings container for under-threshold records', () => {
            const warnings = [
                { reason: '違規洗版', timestamp: '2026-01-01T12:00:00.000Z', by: 'Admin#0001' },
                { reason: '不當言論', timestamp: '2026-02-01T12:00:00.000Z', by: 'Mod#0002' }
            ];

            const payload = ModerationHelper.buildActionableWarningsCard({
                user: mockUserWithCreated,
                executor: mockExecutor,
                warnings
            });

            assert.ok(payload.flags & MessageFlags.IsComponentsV2);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0];
            const json = container.toJSON();

            assert.equal(json.type, 17);
            assert.equal(json.accent_color, 0xf1c40f); // Under threshold: amber yellow

            const components = json.components;
            // 1. Heading 1
            assert.match(components[0].content, /^# 📋 成員處分檔案/);

            // 2. Separator (Divider)
            assert.equal(components[1].type, 14);
            assert.equal(components[1].divider, true);

            // 3. Section with target user info
            assert.equal(components[2].type, 9);
            const sectionTexts = components[2].components;
            assert.match(sectionTexts[0].content, /<@123456789012345678>/);
            assert.match(sectionTexts[0].content, /bad_user#0001/);
            assert.match(sectionTexts[1].content, /123456789012345678/);
            assert.match(sectionTexts[1].content, /註冊於 <t:1700000000:R>/);
            assert.match(sectionTexts[2].content, /> \*\*處分狀態\*\*：`2 次警告`/);
            assert.equal(components[2].accessory.type, 11);

            // 4. Timeline
            const timeline = components.find((c) => c.content?.includes('歷史警告記錄'));
            assert.ok(timeline);
            assert.match(timeline.content, /`#01` \*\*違規洗版\*\*/);
            assert.match(timeline.content, /`#02` \*\*不當言論\*\*/);
            assert.match(timeline.content, /累計警告共 2 次/);

            // 5. ActionRow
            const actionRow = components.find((c) => c.type === 1);
            assert.ok(actionRow);
            assert.equal(actionRow.components.length, 2);

            // Timeout button (Secondary)
            assert.equal(actionRow.components[0].custom_id, 'mod:timeout:123456789012345678:600');
            assert.equal(actionRow.components[0].label, '禁言 10 分鐘');
            assert.equal(actionRow.components[0].style, 2);

            // Clear warns button (Secondary)
            assert.equal(actionRow.components[1].custom_id, 'mod:clearwarns:123456789012345678');
            assert.equal(actionRow.components[1].label, '清除記錄');
            assert.equal(actionRow.components[1].style, 2);

            // 6. Footer Subtext
            const footer = components[components.length - 1];
            assert.match(footer.content, /-# 查詢人員：<@987654321098765432>/);
            assert.match(footer.content, /僅管理員可見/);
        });

        it('escalates to alert red and adds ban escalation button when threshold is reached', () => {
            const warnings = [
                { reason: '警告 1', timestamp: '2026-01-01T12:00:00.000Z', by: 'Admin#0001' },
                { reason: '警告 2', timestamp: '2026-02-01T12:00:00.000Z', by: 'Mod#0002' },
                { reason: '警告 3', timestamp: '2026-03-01T12:00:00.000Z', by: 'Admin#0001' }
            ];

            const payload = ModerationHelper.buildActionableWarningsCard({
                user: mockUserWithCreated,
                executor: mockExecutor,
                warnings
            });

            const json = payload.components[0].toJSON();
            // Escalated accent color: Alert Red
            assert.equal(json.accent_color, 0xda373c);
            assert.match(json.components[0].content, /^# 📋 成員處分檔案/);

            // Section indicates threshold reached
            const section = json.components.find((c) => c.type === 9);
            assert.match(section.components[2].content, /已達處分門檻/);

            // ActionRow has 3 buttons: Timeout (Secondary), Ban (Danger), ClearWarns (Secondary)
            const actionRow = json.components.find((c) => c.type === 1);
            assert.equal(actionRow.components.length, 3);
            assert.equal(actionRow.components[0].style, 2); // Secondary
            assert.equal(actionRow.components[0].label, '禁言 10 分鐘');

            assert.equal(actionRow.components[1].custom_id, 'mod:ban:123456789012345678');
            assert.equal(actionRow.components[1].style, 4); // Danger
            assert.equal(actionRow.components[1].label, '升級為封鎖');

            assert.equal(actionRow.components[2].custom_id, 'mod:clearwarns:123456789012345678');
        });

        it('handles empty warnings array and custom limits cleanly', () => {
            const payload = ModerationHelper.buildActionableWarningsCard({
                user: mockUserWithCreated,
                executor: mockExecutor,
                warnings: [],
                maxDisplay: 5
            });

            const json = payload.components[0].toJSON();
            assert.equal(json.accent_color, Colors.Success);

            const timeline = json.components.find((c) => c.content?.includes('歷史警告記錄'));
            assert.match(timeline.content, /沒有任何警告處分記錄/);
        });
    });
});
