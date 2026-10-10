import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import MusicPresenter from '../src/core/music/MusicPresenter';

describe('MusicPresenter (UI Presentation Layer)', () => {
    it('builds now playing message payload cleanly', async () => {
        const mockSong = {
            title: 'Test Song',
            author: 'Test Artist',
            duration: 180000,
            url: 'https://youtube.com/watch?v=12345',
            thumbnail: 'https://img.youtube.com/vi/12345/hqdefault.jpg',
            requester: { id: '999' }
        };

        const payload = await MusicPresenter.buildNowPlayingMessage(mockSong, '111222333', (ms) => '3:00');
        assert.ok(payload.components);
        assert.equal(payload.components.length, 1);

        const container = payload.components[0];
        const jsonStr = JSON.stringify(container.toJSON ? container.toJSON() : container);
        // Verify lightweight card properties:
        assert.match(jsonStr, /# 🎶 正在播放/);
        assert.match(jsonStr, /Test Song/);
        assert.match(jsonStr, /Test Artist/);
        assert.match(jsonStr, /3:00/);
        assert.match(jsonStr, /<@999>/);
        assert.doesNotMatch(jsonStr, /💡/);
        assert.doesNotMatch(jsonStr, /\/nowplaying/);
        // Verify absence of heavy interactive control buttons or progress bar in notification
        assert.doesNotMatch(jsonStr, /music:toggle_pause/);
        assert.doesNotMatch(jsonStr, /music:skip/);
        assert.doesNotMatch(jsonStr, /🔘/);
    });

    it('builds full interactive now playing console card cleanly', () => {
        const mockSong = {
            title: 'Test Song',
            author: 'Test Artist',
            duration: 180000,
            url: 'https://youtube.com/watch?v=12345',
            thumbnail: 'https://img.youtube.com/vi/12345/hqdefault.jpg',
            requester: { id: '999' }
        };

        const payload = MusicPresenter.buildNowPlayingCard({
            song: mockSong,
            voiceChannelId: '111222333',
            currentPosition: 30000,
            isPaused: false
        });

        assert.ok(payload.components);
        const container = payload.components[0];
        const jsonStr = JSON.stringify(container.toJSON ? container.toJSON() : container);
        assert.match(jsonStr, /# ▶️ 正在播放/);
        assert.match(jsonStr, /music:toggle_pause/);
        assert.match(jsonStr, /music:skip/);
        assert.match(jsonStr, /🔘/);
        assert.doesNotMatch(jsonStr, /💡/);
    });

    it('builds playlist added message payload', () => {
        const payload = MusicPresenter.buildPlaylistAddedMessage('Anime OST', 12, 'User#0001');
        assert.ok(payload.components);
        assert.equal(payload.components.length, 1);
    });

    describe('Track Exception Sanitization & Error Card Presentation', () => {
        it('desensitizes raw Java stack traces and low-level errors into human-readable messages', () => {
            const rawTrace = `(yts.version: f45bbb7aebfcbc1c553769e04af6cd43afa8b7c3) All clients failed to load the item.
Client [TVHTML5] failed: Read timed out
    at java.base/sun.nio.ch.NioSocketImpl.timedRead(NioSocketImpl.java:278)
Client [WEB] failed: No supported audio streams available`;

            const desensitized = MusicPresenter.resolveFriendlyTrackError(rawTrace);
            // Must not contain Java class names or raw stack trace
            assert.doesNotMatch(desensitized, /NioSocketImpl/);
            assert.doesNotMatch(desensitized, /yts\.version/);
            assert.doesNotMatch(desensitized, /TVHTML5/);
            // Must contain friendly Chinese message
            assert.match(desensitized, /連線逾時/);

            const loginError = 'Sign in to confirm your age. This video may be inappropriate for some users.';
            assert.match(MusicPresenter.resolveFriendlyTrackError(loginError), /YouTube 限制.*年齡驗證/);

            const geoError = 'Video is not available in your country due to copyright.';
            assert.match(MusicPresenter.resolveFriendlyTrackError(geoError), /地區限制/);

            const streamError = 'No supported audio streams available, available types: []';
            assert.match(MusicPresenter.resolveFriendlyTrackError(streamError), /音訊串流無效/);
        });

        it('builds a polished, sanitized CV2 track exception card without leaking traces', () => {
            const mockSong = {
                title: 'Problematic Song Title',
                url: 'https://youtube.com/watch?v=err123',
                thumbnail: 'https://img.youtube.com/vi/err123/hqdefault.jpg'
            };

            const rawTrace = `(yts.version: f45bbb7aebfcbc1c553769e04af6cd43afa8b7c3) All clients failed to load the item.
Client [TVHTML5] failed: Read timed out
    at java.base/sun.nio.ch.NioSocketImpl.timedRead(NioSocketImpl.java:278)`;

            const payload = MusicPresenter.buildTrackExceptionMessage(mockSong, rawTrace);
            assert.ok(payload.components);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0];
            const data = container.toJSON ? container.toJSON() : container.data;
            assert.equal(data.accent_color, 0xed4245); // Danger Red

            const jsonStr = JSON.stringify(data);
            // Verify friendly contents
            assert.match(jsonStr, /# <a:cross:1524603300752785550> 略過無法播放的曲目/);
            assert.match(jsonStr, /Problematic Song Title/);
            assert.match(jsonStr, /連線逾時/);
            assert.match(jsonStr, /hqdefault\.jpg/);
            assert.match(jsonStr, /已自動為你跳過並載入下一首曲目/);
            assert.doesNotMatch(jsonStr, /💡/);
            assert.doesNotMatch(jsonStr, /-#/);

            // CRITICAL: Verify ZERO leakage of internal details
            assert.doesNotMatch(jsonStr, /NioSocketImpl/);
            assert.doesNotMatch(jsonStr, /yts\.version/);
            assert.doesNotMatch(jsonStr, /TVHTML5/);
            assert.doesNotMatch(jsonStr, /java\.base/);
        });

        it('handles null song or empty error gracefully in buildTrackExceptionMessage', () => {
            const payload = MusicPresenter.buildTrackExceptionMessage(null, null);
            assert.ok(payload.components);
            const jsonStr = JSON.stringify(
                payload.components[0].toJSON ? payload.components[0].toJSON() : payload.components[0].data
            );
            assert.match(jsonStr, /當前曲目/);
            assert.match(jsonStr, /音訊串流載入失敗/);
        });
    });

    describe('Search Selector Card (Scheme A with True Headings)', () => {
        const mockTracks = [
            {
                info: {
                    title: 'Song One - Best Match',
                    author: 'Artist Alpha',
                    length: 215000,
                    uri: 'https://youtube.com/watch?v=one111',
                    identifier: 'one111',
                    artworkUrl: 'https://img.youtube.com/vi/one111/hqdefault.jpg'
                }
            },
            {
                info: {
                    title: 'Song Two - Secondary Match',
                    author: 'Artist Beta',
                    length: 180000,
                    uri: 'https://youtube.com/watch?v=two222'
                }
            },
            {
                info: {
                    title: 'Song Three - Live Performance',
                    author: 'Artist Gamma',
                    length: 0,
                    uri: 'https://youtube.com/watch?v=three333'
                }
            }
        ];

        it('builds Scheme A search selector card with True Headings (#, ##, ###) and subtext (-#)', async () => {
            const { container, selectMenu } = await MusicPresenter.buildSearchSelectorCard({
                query: 'test query',
                tracks: mockTracks,
                timeoutSec: 25
            });

            assert.ok(container);
            assert.ok(selectMenu);

            const containerJson = JSON.stringify(container.toJSON ? container.toJSON() : container);

            // 1. True Level 1 Heading (#) for Container Header
            assert.match(containerJson, /# 🔍 音樂搜尋結果/);
            // Subtext (-#) for search query and candidate count
            assert.match(containerJson, /-# 關鍵字：`test query` • 共找到 3 首相關曲目/);

            // 2. True Level 2 Heading (##) for Hero Best Match
            assert.match(containerJson, /💡 \*\*最佳匹配推薦\*\*/);
            assert.match(containerJson, /## \[Song One - Best Match\]\(https:\/\/youtube\.com\/watch\?v=one111\)/);
            assert.match(containerJson, /Artist Alpha/);
            assert.match(containerJson, /3:35/);

            // 3. Hero Section includes thumbnail accessory
            assert.match(containerJson, /hqdefault\.jpg/);

            // 4. True Level 3 Heading (###) for Candidates 2~5
            assert.match(containerJson, /### 更多候選曲目/);
            assert.match(containerJson, /\*\*2\.\*\* \[Song Two - Secondary Match\]/);
            assert.match(containerJson, /Artist Beta/);
            assert.match(containerJson, /3:00/);
            assert.match(containerJson, /\*\*3\.\*\* \[Song Three - Live Performance\]/);
            assert.match(containerJson, /直播流/);

            // 5. Expiration Subtext (-#)
            assert.match(containerJson, /-# ⏱️ 選單將在 25 秒後失效/);

            // 6. SelectMenu options verification
            const menuJson = JSON.stringify(selectMenu.toJSON ? selectMenu.toJSON() : selectMenu);
            assert.match(menuJson, /yt_select/);
            assert.match(menuJson, /1\. Song One - Best Match/);
            assert.match(menuJson, /Artist Alpha \| ⏱️ 3:35/);
            assert.match(menuJson, /2\. Song Two - Secondary Match/);
            assert.match(menuJson, /Artist Beta \| ⏱️ 3:00/);
            assert.match(menuJson, /3\. Song Three - Live Performance/);
            assert.match(menuJson, /直播流/);
        });

        it('falls back cleanly to plain text when top track has no thumbnail', async () => {
            const tracksNoThumb = [
                {
                    info: {
                        title: 'Song Without Thumbnail',
                        author: 'Indie Artist',
                        length: 120000,
                        uri: 'https://youtube.com/watch?v=nothumb'
                    }
                }
            ];

            const { container, selectMenu } = await MusicPresenter.buildSearchSelectorCard({
                query: 'indie',
                tracks: tracksNoThumb,
                timeoutSec: 30
            });

            const containerJson = JSON.stringify(container.toJSON ? container.toJSON() : container);
            assert.match(containerJson, /# 🔍 音樂搜尋結果/);
            assert.match(containerJson, /## \[Song Without Thumbnail\]/);
            // With only 1 track, candidate section 2~5 should not be rendered
            assert.doesNotMatch(containerJson, /### 更多候選曲目/);
            assert.match(containerJson, /-# ⏱️ 選單將在 30 秒後失效/);
        });
    });

    describe('Queue Dashboard Card (Scheme C with True Headings and Action Controls)', () => {
        const mockSongs = [
            {
                title: 'Current Hero Song',
                author: 'Hero Singer',
                duration: 215000,
                url: 'https://youtube.com/watch?v=hero123',
                thumbnail: 'https://img.youtube.com/vi/hero123/hqdefault.jpg',
                requester: { id: 'user-hero' }
            },
            {
                title: 'Upcoming Song 1',
                author: 'Singer 1',
                duration: 180000,
                url: 'https://youtube.com/watch?v=up1',
                requester: { id: 'user-1' }
            },
            {
                title: 'Upcoming Song 2',
                author: 'Singer 2',
                duration: 240000,
                url: 'https://youtube.com/watch?v=up2',
                requester: { id: 'user-2' }
            }
        ];

        it('builds Scheme C queue dashboard with True Headings (#, ##, ###), Hero Section, and 5 ActionRow buttons', async () => {
            const payload = await MusicPresenter.buildQueueDashboardCard({
                songs: mockSongs,
                voiceChannelId: 'vc-999',
                isPaused: false,
                loopMode: 'track',
                formatDurationFn: (ms) => MusicPresenter.formatDuration(ms)
            });

            assert.ok(payload.components);
            assert.equal(payload.components.length, 1);

            const container = payload.components[0];
            const jsonStr = JSON.stringify(container.toJSON ? container.toJSON() : container);

            // 1. True Level 1 Heading (#) for Queue Dashboard Header
            assert.match(jsonStr, /# 📜 播放清單佇列/);
            assert.match(jsonStr, /<#vc-999>/);
            assert.match(jsonStr, /總計 \*\*3\*\* 首曲目/);
            assert.match(jsonStr, /單曲循環/);

            // 2. True Level 2 Heading (##) for Hero Now Playing Section
            assert.match(jsonStr, /## ▶️ 正在播放/);
            assert.match(jsonStr, /Current Hero Song/);
            assert.match(jsonStr, /Hero Singer/);
            assert.match(jsonStr, /<@user-hero>/);
            assert.match(jsonStr, /hqdefault\.jpg/);

            // 3. True Level 3 Heading (###) for Full-width Upcoming Queue
            assert.match(jsonStr, /### ⏳ 即將播放 \(接下來 2 首\)/);
            assert.match(jsonStr, /`01` \*\*\[Upcoming Song 1\]/);
            assert.match(jsonStr, /<@user-1>/);
            assert.match(jsonStr, /`02` \*\*\[Upcoming Song 2\]/);
            assert.match(jsonStr, /<@user-2>/);

            // 4. Stats Footer (-# subtext)
            assert.match(jsonStr, /-# 📊 佇列總計：\*\*3\*\* 首歌/);

            // 5. ActionRow interactive buttons
            assert.match(jsonStr, /music:toggle_pause/);
            assert.match(jsonStr, /暫停/);
            assert.match(jsonStr, /music:skip/);
            assert.match(jsonStr, /略過/);
            assert.match(jsonStr, /music:loop:cycle/);
            assert.match(jsonStr, /單曲/);
            assert.match(jsonStr, /music:open_play_modal/);
            assert.match(jsonStr, /點歌/);
            assert.match(jsonStr, /https:\/\/youtube\.com\/watch\?v=hero123/);
        });

        it('handles single song queue without upcoming section and adapts pause button', async () => {
            const singleSong = [
                {
                    title: 'Solo Playing Song',
                    author: 'Solo Artist',
                    duration: 120000,
                    thumbnail: '',
                    requester: { id: 'solo-user' }
                }
            ];

            const payload = await MusicPresenter.buildQueueDashboardCard({
                songs: singleSong,
                isPaused: true,
                loopMode: 'none'
            });

            const jsonStr = JSON.stringify(payload.components[0].toJSON());
            assert.match(jsonStr, /# 📜 播放清單佇列/);
            assert.match(jsonStr, /Solo Playing Song/);
            // Notice paused state shows '繼續' button
            assert.match(jsonStr, /繼續/);
            // Upcoming empty message
            assert.match(jsonStr, /佇列目前沒有其他待播歌曲/);
        });
    });
});
