import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
const { MessageFlags } = require('discord.js');

const BotResponsePresenter =
    require('../src/core/bot/BotResponsePresenter').default || require('../src/core/bot/BotResponsePresenter');

describe('BotResponsePresenter (Elevated CV2 Error & Alert Styling)', () => {
    it('formats 權限受限 with shield icon, danger red, blockquote, and security subtext', async () => {
        let sentPayload = null;
        const mockInteraction = {
            deferred: false,
            replied: false,
            reply: async (payload) => {
                sentPayload = payload;
            }
        };

        await BotResponsePresenter.sendError(mockInteraction, '權限受限', '我沒辦法對我自己執行此操作!');

        assert.ok(sentPayload);
        assert.ok(sentPayload.flags & MessageFlags.Ephemeral);
        assert.ok(sentPayload.flags & MessageFlags.IsComponentsV2);

        const containerJson = sentPayload.components[0].toJSON();
        assert.equal(containerJson.type, 17);
        assert.equal(containerJson.accent_color, 0xda373c);

        // Header: Heading 2 with Shield icon
        assert.equal(containerJson.components[0].type, 10);
        assert.match(containerJson.components[0].content, /^## 🛡️ 權限受限/);

        // Divider: Small spacing with divider line
        assert.equal(containerJson.components[1].type, 14);
        assert.equal(containerJson.components[1].spacing, 1);
        assert.equal(containerJson.components[1].divider, true);

        // Body: Clean plain text formatted with security reassurance subtext
        assert.equal(containerJson.components[2].type, 10);
        assert.match(containerJson.components[2].content, /我沒辦法對我自己執行此操作!/);
        assert.equal(containerJson.components[2].content.startsWith('>'), false);
        assert.match(containerJson.components[2].content, /-# 🛡️ 操作已被安全防護機制攔截/);
    });

    it('formats 查無成員 with search icon, warning color, and target subtext', async () => {
        let sentPayload = null;
        const mockInteraction = {
            deferred: true,
            replied: false,
            editReply: async (payload) => {
                sentPayload = payload;
            }
        };

        await BotResponsePresenter.sendError(mockInteraction, '查無成員', '在伺服器中找不到該使用者.');

        assert.ok(sentPayload);
        const containerJson = sentPayload.components[0].toJSON();
        assert.equal(containerJson.accent_color, 0xfee75c);
        assert.match(containerJson.components[0].content, /^## 🔍 查無成員/);
        assert.match(containerJson.components[2].content, /在伺服器中找不到該使用者\./);
        assert.equal(containerJson.components[2].content.startsWith('>'), false);
        assert.match(containerJson.components[2].content, /-# 💡 請確認目標對象是否存在於此伺服器中/);
    });

    it('formats 未在封鎖名單 with search icon, warning amber, and not-banned subtext', async () => {
        let sentPayload = null;
        const mockInteraction = {
            deferred: true,
            replied: false,
            editReply: async (payload) => {
                sentPayload = payload;
            }
        };

        await BotResponsePresenter.sendError(
            mockInteraction,
            '未在封鎖名單',
            '使用者 ID `933694234874216508` 不在這個伺服器的封鎖名單中.'
        );

        assert.ok(sentPayload);
        const containerJson = sentPayload.components[0].toJSON();
        assert.equal(containerJson.accent_color, 0xfee75c);
        assert.match(containerJson.components[0].content, /^## 🔍 未在封鎖名單/);
        assert.match(
            containerJson.components[2].content,
            /使用者 ID `933694234874216508` 不在這個伺服器的封鎖名單中\./
        );
        assert.equal(containerJson.components[2].content.startsWith('>'), false);
        assert.match(containerJson.components[2].content, /-# 💡 該成員目前未處於封鎖狀態/);
    });

    it('formats sendSuccess with checkmark, green color, and clean plain text', async () => {
        let sentPayload = null;
        const mockInteraction = {
            deferred: false,
            replied: false,
            reply: async (payload) => {
                sentPayload = payload;
            }
        };

        await BotResponsePresenter.sendSuccess(mockInteraction, '設定成功', '已成功更新伺服器設定。');

        assert.ok(sentPayload);
        const containerJson = sentPayload.components[0].toJSON();
        assert.equal(containerJson.accent_color, 0x57f287);
        assert.match(containerJson.components[0].content, /^## <a:check:1524601509772529665> 設定成功/);
        assert.match(containerJson.components[2].content, /已成功更新伺服器設定。/);
        assert.equal(containerJson.components[2].content.startsWith('>'), false);
    });

    it('falls back to followUp when editReply fails with Unknown Message', async () => {
        let followUpPayload = null;
        const mockInteraction = {
            deferred: true,
            replied: false,
            editReply: async () => {
                const err = new Error('Unknown Message');
                err.code = 10008;
                throw err;
            },
            followUp: async (payload) => {
                followUpPayload = payload;
            }
        };

        await BotResponsePresenter.sendError(mockInteraction, '權限溢位', '我禁言不了這位成員.');

        assert.ok(followUpPayload);
        const containerJson = followUpPayload.components[0].toJSON();
        assert.match(containerJson.components[0].content, /^## 🛡️ 權限溢位/);
    });
});
