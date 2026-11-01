import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import TTSHandler from '../src/handlers/TTSHandler';

describe('TTSHandler (Text-To-Speech Message Handler)', () => {
    it('returns false when message is outside guild or has no content', async () => {
        const handler = new TTSHandler();
        const res1 = await handler.handle({ guild: null, content: 'hello' }, {});
        assert.equal(res1, false);

        const res2 = await handler.handle({ guild: { id: 'g1' }, content: '' }, {});
        assert.equal(res2, false);
    });

    it('returns false when channel is not configured as TTS channel', async () => {
        const handler = new TTSHandler();
        const mockBot = {
            settings: {
                get: () => ({ channelId: 'tts-channel-different' })
            }
        };
        const mockMessage = {
            guild: { id: 'g1' },
            channel: { id: 'current-channel' },
            content: 'Hello'
        };

        const res = await handler.handle(mockMessage, mockBot);
        assert.equal(res, false);
    });

    it('clears timeout timer on search success and plays audio', async () => {
        const handler = new TTSHandler();
        let timerCleared = false;
        let playedTrack = null;

        const originalClearTimeout = global.clearTimeout;
        global.clearTimeout = (id) => {
            timerCleared = true;
            originalClearTimeout(id);
        };

        const mockTrack = {
            info: { title: '', author: '' }
        };

        const mockBot = {
            settings: {
                get: () => ({ channelId: 'tts-channel', lang: 'zh-TW' })
            },
            music: {
                search: async () => ({
                    tracks: [mockTrack]
                }),
                play: async (vc, channel, track) => {
                    playedTrack = track;
                }
            }
        };

        const mockMessage = {
            guild: {
                id: 'g1',
                members: { me: { voice: { channel: { id: 'vc-1' } } } }
            },
            channel: { id: 'tts-channel' },
            cleanContent: '你好派蒙',
            content: '你好派蒙',
            attachments: { size: 0, some: () => false },
            author: { username: 'TestUser' }
        };

        try {
            const res = await handler.handle(mockMessage, mockBot);
            assert.equal(res, true);
            assert.equal(timerCleared, true, 'clearTimeout must be called on search success');
            assert.ok(playedTrack.info.title.includes('你好派蒙'));
        } finally {
            global.clearTimeout = originalClearTimeout;
        }
    });

    it('clears timeout timer in finally block even when search throws or times out', async () => {
        const handler = new TTSHandler();
        let timerCleared = false;

        const originalClearTimeout = global.clearTimeout;
        global.clearTimeout = (id) => {
            timerCleared = true;
            originalClearTimeout(id);
        };

        const mockBot = {
            settings: {
                get: () => ({ channelId: 'tts-channel', lang: 'zh-TW' })
            },
            music: {
                search: async () => {
                    throw new Error('Network error');
                }
            }
        };

        const mockMessage = {
            guild: {
                id: 'g1',
                members: { me: { voice: { channel: { id: 'vc-1' } } } }
            },
            channel: { id: 'tts-channel' },
            cleanContent: '測試錯誤',
            content: '測試錯誤',
            attachments: { size: 0, some: () => false },
            author: { username: 'TestUser' }
        };

        try {
            const res = await handler.handle(mockMessage, mockBot);
            assert.equal(res, false);
            assert.equal(timerCleared, true, 'clearTimeout must be called in finally when search throws');
        } finally {
            global.clearTimeout = originalClearTimeout;
        }
    });
});
