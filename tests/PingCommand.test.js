import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Colors } from '../src/config';

const pingModule = require('../src/commands/general/ping');
const pingCommand = pingModule.default || pingModule;
const { buildPingContainer, measureStorageLatency, measureLavalinkLatency, measureOllamaLatency } = pingModule;

describe('Ping General Command', () => {
    it('has correct slash command configuration', () => {
        assert.equal(pingCommand.data.name, 'ping');
        assert.equal(pingCommand.category, 'general');
        assert.ok(pingCommand.helpText.includes('/ping'));
    });

    describe('subsystem latency probes', () => {
        it('measures storage latency safely even without bot settings', async () => {
            const latency = await measureStorageLatency();
            assert.ok(typeof latency === 'number');
            assert.ok(latency >= 0.1);
        });

        it('measures storage latency safely with mock bot settings', async () => {
            const mockBot = {
                settings: {
                    filePath: process.cwd()
                }
            };
            const latency = await measureStorageLatency(mockBot);
            assert.ok(typeof latency === 'number');
            assert.ok(latency >= 0.1);
        });

        it('measures lavalink latency safely when music service is unconfigured', async () => {
            const res = await measureLavalinkLatency();
            assert.deepEqual(res, { latency: -1, status: '未配置' });

            const mockBotWithoutNodes = {
                music: { shoukaku: { nodes: new Map() } }
            };
            const resEmpty = await measureLavalinkLatency(mockBotWithoutNodes);
            assert.deepEqual(resEmpty, { latency: -1, status: '未配置' });
        });

        it('measures lavalink latency safely when node is disconnected', async () => {
            const mockNode = { state: 3 }; // DISCONNECTED
            const nodes = new Map([['default', mockNode]]);
            const mockBot = {
                music: { shoukaku: { nodes } }
            };
            const res = await measureLavalinkLatency(mockBot);
            assert.deepEqual(res, { latency: -1, status: '未連線' });
        });

        it('measures lavalink latency successfully when node is connected', async () => {
            const mockNode = {
                state: 1, // CONNECTED
                rest: {
                    getLavalinkInfo: async () => ({ version: '4.0.0' })
                }
            };
            const nodes = new Map([['default', mockNode]]);
            const mockBot = {
                music: { shoukaku: { nodes } }
            };
            const res = await measureLavalinkLatency(mockBot);
            assert.ok(res.latency >= 0.1);
            assert.match(res.status, /ms$/);
        });

        it('measures ollama latency safely without uncaught exceptions', async () => {
            const res = await measureOllamaLatency();
            assert.ok(res.status);
            assert.ok(typeof res.latency === 'number');
        });
    });

    describe('buildPingContainer', () => {
        const createMockBot = (overrides = {}) => ({
            user: {
                id: '123456789012345678',
                username: 'PaiMon',
                discriminator: '0',
                displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png',
                ...overrides.user
            },
            ...overrides
        });

        it('sets accent color to Colors.Success when latency is optimal (<= 200ms)', () => {
            const bot = createMockBot();
            const container = buildPingContainer(bot, { roundtrip: 80, wsPing: 40, execTime: 1.2, ioTime: 0.4 });
            const json = container.toJSON();

            assert.equal(json.accent_color, Colors.Success);
        });

        it('sets accent color to Colors.Warning when latency is moderate (201-500ms)', () => {
            const bot = createMockBot();
            const container = buildPingContainer(bot, { roundtrip: 350, wsPing: 50, execTime: 1.5, ioTime: 0.6 });
            const json = container.toJSON();

            assert.equal(json.accent_color, Colors.Warning);
        });

        it('sets accent color to Colors.Error when latency exceeds 500ms or wsPing is negative', () => {
            const bot = createMockBot();
            const highRttContainer = buildPingContainer(bot, { roundtrip: 650, wsPing: 50 });
            assert.equal(highRttContainer.toJSON().accent_color, Colors.Error);

            const highWsContainer = buildPingContainer(bot, { roundtrip: 60, wsPing: 550 });
            assert.equal(highWsContainer.toJSON().accent_color, Colors.Error);

            const negativeWsContainer = buildPingContainer(bot, { roundtrip: 50, wsPing: -1 });
            assert.equal(negativeWsContainer.toJSON().accent_color, Colors.Error);
        });

        it('implements Level 1 Markdown Heading (#), 6 full-link metrics, and Subtext (-#)', () => {
            const bot = createMockBot();
            const container = buildPingContainer(bot, {
                roundtrip: 65,
                wsPing: 32,
                execTime: 1.4,
                ioTime: 0.3,
                lavalink: { latency: 12.5, status: '12.5ms' },
                ollama: { latency: 45.2, status: '45.2ms' },
                measuredAtUnix: 1700000000
            });
            const json = container.toJSON();

            const textContents = [];
            for (const comp of json.components || []) {
                if (comp.content) textContents.push(comp.content);
                if (comp.components) {
                    for (const sub of comp.components) {
                        if (sub.content) textContents.push(sub.content);
                    }
                }
            }

            const allText = textContents.join('\n');

            // 1. Top Title must be Level 1 Heading (#)
            assert.match(allText, /^# ⚡ 核心系統全鏈路診斷/m, 'Must contain Level 1 Heading');

            // 2. Section contains 6 full-link metrics and status badge
            assert.match(allText, /🟢 \*\*全系統運作極佳\*\*/, 'Must contain status badge');
            assert.match(allText, /📡 \*\*網關心跳\*\*：`32ms`/, 'Must contain formatted WS ping');
            assert.match(allText, /🌐 \*\*核心往返\*\*：`65ms`/, 'Must contain roundtrip latency');
            assert.match(allText, /⚡ \*\*本機調度\*\*：`1.4ms`/, 'Must contain internal compute latency');
            assert.match(allText, /💾 \*\*儲存讀寫\*\*：`0.3ms`/, 'Must contain storage I/O latency');
            assert.match(allText, /🎵 \*\*音訊節點\*\*：`12.5ms`/, 'Must contain Lavalink audio node status');
            assert.match(allText, /🤖 \*\*AI 引擎\*\*：`45.2ms`/, 'Must contain Ollama AI engine status');

            // 3. Subtext (-#) with timestamp
            assert.match(allText, /-# 🕒 測量完成於 <t:1700000000:T>/, 'Must contain subtext timestamp');
        });

        it('includes thumbnail accessory with bot avatar and fallback', () => {
            const botWithAvatar = createMockBot();
            const container = buildPingContainer(botWithAvatar, { roundtrip: 50, wsPing: 30 });
            const json = container.toJSON();

            const sectionWithThumb = json.components.find((c) => c.accessory?.type === 11 || c.accessory?.media);
            assert.ok(sectionWithThumb, 'Section with thumbnail accessory should exist');
            assert.equal(sectionWithThumb.accessory.media.url, 'https://cdn.discordapp.com/avatars/123/avatar.png');

            // Fallback avatar test
            const botWithoutAvatar = createMockBot({
                user: { displayAvatarURL: null }
            });
            const fallbackContainer = buildPingContainer(botWithoutAvatar, { roundtrip: 50, wsPing: 30 });
            const fallbackJson = fallbackContainer.toJSON();
            const fallbackSection = fallbackJson.components.find((c) => c.accessory?.media);
            assert.equal(fallbackSection.accessory.media.url, 'https://cdn.discordapp.com/embed/avatars/0.png');
        });

        it('controls refresh button disabled state based on options', () => {
            const bot = createMockBot();
            const activeJson = buildPingContainer(bot, { roundtrip: 50, wsPing: 30, disabled: false }).toJSON();
            const disabledJson = buildPingContainer(bot, { roundtrip: 50, wsPing: 30, disabled: true }).toJSON();

            const findButton = (c) => {
                for (const item of c.components || []) {
                    if (item.components) {
                        const btn = item.components.find((b) => b.custom_id === 'refresh_ping');
                        if (btn) return btn;
                    }
                }
                return null;
            };

            const activeBtn = findButton(activeJson);
            assert.ok(activeBtn);
            assert.equal(activeBtn.disabled, false);

            const disabledBtn = findButton(disabledJson);
            assert.ok(disabledBtn);
            assert.equal(disabledBtn.disabled, true);
        });
    });

    describe('execute interaction lifecycle', () => {
        it('measures latency and updates reply successfully with backward compatible mocks', async () => {
            let repliedOptions = null;
            let editedOptions = null;

            const mockInteraction = {
                createdTimestamp: 1000,
                reply: async (opts) => {
                    repliedOptions = opts;
                },
                fetchReply: async () => ({
                    createdTimestamp: 1085
                }),
                editReply: async (opts) => {
                    editedOptions = opts;
                }
            };

            const mockBot = {
                ws: { ping: 42.4 },
                user: {
                    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/123/avatar.png'
                }
            };

            await pingCommand.execute(mockInteraction, mockBot);

            assert.ok(repliedOptions);
            assert.ok(editedOptions);
            assert.ok(editedOptions.components);
        });

        it('handles negative WebSocket ping boundary gracefully', async () => {
            let editedOptions = null;

            const mockInteraction = {
                createdTimestamp: 1000,
                reply: async () => {},
                fetchReply: async () => ({
                    createdTimestamp: 1050
                }),
                editReply: async (opts) => {
                    editedOptions = opts;
                }
            };

            const mockBot = {
                ws: { ping: -1 }
            };

            await pingCommand.execute(mockInteraction, mockBot);
            assert.ok(editedOptions);
        });

        it('manages interactive button collector events (refresh, unauthorized user, timeout)', async () => {
            let repliedOptions = null;
            let collectorEvents = {};
            let editedOptions = null;

            const mockCollector = {
                on: (event, handler) => {
                    collectorEvents[event] = handler;
                }
            };

            const mockInteraction = {
                user: { id: 'user-initiator' },
                createdTimestamp: 1000,
                reply: async (opts) => {
                    repliedOptions = opts;
                },
                fetchReply: async () => ({
                    createdTimestamp: 1060,
                    createMessageComponentCollector: (opts) => {
                        assert.equal(opts.time, 60_000);
                        return mockCollector;
                    }
                }),
                editReply: async (opts) => {
                    editedOptions = opts;
                }
            };

            const mockBot = {
                ws: { ping: 25 },
                user: {
                    displayAvatarURL: () => 'https://example.com/avatar.png'
                }
            };

            await pingCommand.execute(mockInteraction, mockBot);

            assert.ok(repliedOptions);
            assert.ok(editedOptions);

            // Test unauthorized button click
            let unauthorizedReply = null;
            const mockStrangerClick = {
                user: { id: 'stranger-999' },
                reply: async (opts) => {
                    unauthorizedReply = opts;
                }
            };
            await collectorEvents['collect'](mockStrangerClick);
            assert.ok(unauthorizedReply);
            assert.ok(unauthorizedReply.content.includes('屬於發起指令的成員'));

            // Test authorized button refresh
            let deferred = false;
            const mockOwnerClick = {
                user: { id: 'user-initiator' },
                customId: 'refresh_ping',
                deferUpdate: async () => {
                    deferred = true;
                }
            };
            await collectorEvents['collect'](mockOwnerClick);
            assert.ok(deferred);
            assert.ok(editedOptions);

            // Test collector timeout (end)
            collectorEvents['end']();
            await new Promise((r) => setImmediate(r));
            assert.ok(editedOptions);
        });

        it('catches and reports unexpected exceptions cleanly', async () => {
            let sentError = null;

            const mockInteraction = {
                createdTimestamp: 1000,
                reply: async () => {
                    throw new Error('Discord API Network Timeout');
                }
            };

            const mockBot = {
                ws: { ping: 50 },
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };

            await pingCommand.execute(mockInteraction, mockBot);

            assert.ok(sentError);
            assert.equal(sentError.title, '偵測失敗');
        });
    });
});
