import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MusicPlayModalButtonHandler =
    require('../src/core/components/MusicPlayModalButtonHandler').default ||
    require('../src/core/components/MusicPlayModalButtonHandler');

const MusicPlayModalSubmitHandler =
    require('../src/core/components/MusicPlayModalSubmitHandler').default ||
    require('../src/core/components/MusicPlayModalSubmitHandler');

describe('MusicPlayModal Handlers', () => {
    describe('MusicPlayModalButtonHandler', () => {
        const buttonHandler = new MusicPlayModalButtonHandler();

        it('matches customId music:open_play_modal', () => {
            assert.equal(buttonHandler.customId, 'music:open_play_modal');
            assert.equal(buttonHandler.matches('music:open_play_modal'), true);
            assert.equal(buttonHandler.matches('other'), false);
        });

        it('rejects when user is not in a voice channel', async () => {
            let sentError = null;
            const mockBot = {
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                member: { voice: { channel: null } }
            };

            await buttonHandler.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '語音連線遭拒');
        });

        it('shows modal when member is in voice channel', async () => {
            let shownModal = null;
            const mockBot = {};
            const mockInteraction = {
                inCachedGuild: () => true,
                member: { voice: { channel: { id: 'vc-1' } } },
                showModal: async (modal) => {
                    shownModal = modal;
                }
            };

            await buttonHandler.execute(mockInteraction, mockBot);
            assert.ok(shownModal);
            const modalData = shownModal.toJSON();
            assert.equal(modalData.custom_id, 'music:modal:play');
            assert.equal(modalData.title, '🎵 點播音樂');
        });
    });

    describe('MusicPlayModalSubmitHandler', () => {
        const submitHandler = new MusicPlayModalSubmitHandler();

        it('matches customId music:modal:play', () => {
            assert.equal(submitHandler.customId, 'music:modal:play');
            assert.equal(submitHandler.matches('music:modal:play'), true);
        });

        it('rejects when query is too short', async () => {
            let sentError = null;
            const mockBot = {
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                fields: {
                    getTextInputValue: () => 'a'
                }
            };

            await submitHandler.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '搜尋詞過短');
        });

        it('rejects when user is not in voice channel', async () => {
            let sentError = null;
            const mockBot = {
                sendError: async (interaction, title, desc) => {
                    sentError = { title, desc };
                }
            };
            const mockInteraction = {
                inCachedGuild: () => true,
                fields: {
                    getTextInputValue: () => 'Yoasobi'
                },
                member: { voice: { channel: null } }
            };

            await submitHandler.execute(mockInteraction, mockBot);
            assert.ok(sentError);
            assert.equal(sentError.title, '語音連線遭拒');
        });

        it('searches and plays track successfully', async () => {
            let playedTrack = null;
            let deferred = false;

            const mockBot = {
                music: {
                    search: async (query) => ({
                        isPlaylist: false,
                        tracks: [{ info: { title: 'Test Song', author: 'Artist' } }]
                    }),
                    play: async (vc, tc, track, user) => {
                        playedTrack = track;
                    },
                    getQueue: () => null
                }
            };

            const mockInteraction = {
                inCachedGuild: () => true,
                fields: {
                    getTextInputValue: () => 'Yoasobi'
                },
                member: {
                    voice: { channel: { id: 'vc-1' } }
                },
                channel: {
                    id: 'tc-1',
                    isTextBased: () => true
                },
                user: { id: 'user-1' },
                guild: { id: 'guild-1' },
                deferReply: async () => {
                    deferred = true;
                    mockInteraction.deferred = true;
                },
                deleteReply: async () => {}
            };

            await submitHandler.execute(mockInteraction, mockBot);
            assert.equal(deferred, true);
            assert.ok(playedTrack);
            assert.equal(playedTrack.info.title, 'Test Song');
        });
    });
});
