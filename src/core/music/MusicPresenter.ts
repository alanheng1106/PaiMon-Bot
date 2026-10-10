import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    User
} from 'discord.js';
import { Colors, Emojis } from '../../config';
import { getAverageColor } from 'fast-average-color-node';
import ColorUtils from '../../utils/ColorUtils';
import Song from './Song';

export interface NowPlayingCardParams {
    song: {
        title: string;
        author?: string;
        duration: number;
        thumbnail?: string;
        url?: string;
        requester?: { id?: string } | string | any;
    };
    voiceChannelId: string;
    currentPosition?: number;
    isPaused?: boolean;
    loopMode?: string;
    queueLength?: number;
    nextSongTitle?: string;
    progressBar?: string;
    accentColor?: number;
}

/**
 * MusicPresenter — Encapsulates Discord UI card rendering for music events.
 * Keeps presentation concerns isolated from audio playback domain logic (SRP).
 */
class MusicPresenter {
    /**
     * Compute average color from a thumbnail URL, returning fallback hex on failure.
     */
    static async computeAccentColor(thumbnailUrl?: string): Promise<number> {
        if (!thumbnailUrl) return Colors.Music;
        try {
            const colorData = await getAverageColor(thumbnailUrl);
            if (colorData && colorData.hex) {
                return ColorUtils.hexToInt(colorData.hex, Colors.Music);
            }
        } catch {
            // Ignore color extraction errors
        }
        return Colors.Music;
    }

    /**
     * Build the interactive Scheme B Now Playing Card using Discord CV2 components.
     */
    static buildNowPlayingCard(params: NowPlayingCardParams): { components: any[]; flags: any } {
        const {
            song,
            voiceChannelId,
            currentPosition = 0,
            isPaused = false,
            loopMode = 'none',
            queueLength = 1,
            nextSongTitle,
            progressBar,
            accentColor
        } = params;

        const isLive = song.duration <= 0;
        const durationStr = isLive ? '🔴 直播流' : this.formatDuration(song.duration);

        // 1. 狀態感知標題與 Accent Color (暫停琥珀金、直播串流紅、播放中活力綠/封面色)
        let finalAccentColor: number;
        let statusHeader: string;

        if (isPaused) {
            finalAccentColor = 0xfee75c; // Amber Yellow
            statusHeader = '# ⏸️ 已暫停播放';
        } else if (isLive) {
            finalAccentColor = 0xed4245; // Live Stream Red
            statusHeader = '# 🔴 正在直播';
        } else {
            finalAccentColor = accentColor ?? 0x57f287; // Vibrant Green or extracted
            statusHeader = '# ▶️ 正在播放';
        }

        // 2. Hero Section: 2 行曲目資訊 + 右側 80x80 Thumbnail，高度完美協調
        const cleanTitle = song.title
            ? song.title.length > 50
                ? song.title.slice(0, 47) + '...'
                : song.title
            : '未知曲目';
        const cleanAuthor = song.author
            ? song.author.length > 30
                ? song.author.slice(0, 27) + '...'
                : song.author
            : '未知歌手';

        const titleMd = song.url ? `## [${cleanTitle}](${song.url})` : `## ${cleanTitle}`;
        const trackSubtitle = `🎤 **${cleanAuthor}** • ⏱️ \`${durationStr}\``;

        // 3. 全寬進度條：獨立組件，避免在手機窄螢幕被縮略圖擠壓折行
        const progressText = progressBar
            ? progressBar
            : isLive
              ? '🔴 **即時直播串流 (即時播放)**'
              : this.createProgressBar(currentPosition, song.duration);

        // 4. 交互式播控按鈕組 (ActionRow: 暫停/繼續、略過、循環輪替、開啟點歌彈窗、來源連結)
        const isLoopActive = loopMode === 'track' || loopMode === 'queue';
        const loopLabel = loopMode === 'track' ? '單曲' : loopMode === 'queue' ? '佇列' : '循環';
        const loopEmoji = loopMode === 'track' ? '🔂' : '🔁';

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('music:toggle_pause')
                .setLabel(isPaused ? '繼續' : '暫停')
                .setEmoji(isPaused ? '▶️' : '⏸️')
                .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('music:skip')
                .setLabel('略過')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('music:loop:cycle')
                .setLabel(loopLabel)
                .setEmoji(loopEmoji)
                .setStyle(isLoopActive ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('music:open_play_modal')
                .setLabel('點歌')
                .setEmoji('➕')
                .setStyle(ButtonStyle.Secondary)
        );

        if (song.url) {
            actionRow.addComponents(
                new ButtonBuilder().setLabel('來源').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(song.url)
            );
        }

        // 5. 底部次要資訊 (-# subtext)：點播者、頻道、隊列下一首
        let requesterId: string | undefined;
        if (typeof song.requester === 'object' && song.requester !== null) {
            requesterId = song.requester.id;
        } else if (typeof song.requester === 'string') {
            requesterId = song.requester;
        }
        const requesterTag = requesterId ? `<@${requesterId}>` : '未知點播者';
        let footerContent = `-# 👤 點播者：${requesterTag} • 🔊 語音頻道：<#${voiceChannelId}>`;

        if (nextSongTitle) {
            const cleanNext = nextSongTitle.length > 30 ? nextSongTitle.slice(0, 27) + '...' : nextSongTitle;
            const remainingCount = Math.max(0, queueLength - 1);
            footerContent += `\n-# ⏭️ 下一首：**${cleanNext}** • 佇列剩餘 **${remainingCount}** 首`;
        }

        // 6. CV2 容器構建（精緻間距與分割線）
        const container = new ContainerBuilder()
            .setAccentColor(finalAccentColor)
            // 頂部狀態一級大標題
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(statusHeader))
            // 緊湊分割線
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // 核心曲目：若有封面則使用 Section 配搭 Thumbnail Accessory，若無封面則直接使用文字組件以避免 Discord 驗證報錯
        if (song.thumbnail) {
            const heroSection = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${titleMd}\n${trackSubtitle}`))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(song.thumbnail));
            container.addSectionComponents(heroSection);
        } else {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${titleMd}\n${trackSubtitle}`));
        }

        container
            // 呼吸留白（無分隔線）
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
            // 全寬進度條
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(progressText))
            // 操作區分割線
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            // 播控交互按鈕
            .addActionRowComponents(actionRow)
            // 底部次要資訊
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(footerContent));

        return {
            components: [container],
            flags: MessageFlags.IsComponentsV2 as any
        };
    }

    /**
     * Build lightweight 'Track Started' notification payload.
     * Compact announcement without frozen progress bars or redundant control buttons.
     */
    static async buildNowPlayingMessage(
        song: Song | any,
        voiceChannelId: string,
        formatDurationFn?: (ms: number) => string
    ): Promise<{ components: any[]; flags: any }> {
        const accentColor = await this.computeAccentColor(song.thumbnail);
        const durationText = formatDurationFn ? formatDurationFn(song.duration) : this.formatDuration(song.duration);

        const cleanTitle = song.title
            ? song.title.length > 50
                ? song.title.slice(0, 47) + '...'
                : song.title
            : '未知曲目';
        const cleanAuthor = song.author
            ? song.author.length > 30
                ? song.author.slice(0, 27) + '...'
                : song.author
            : '未知歌手';

        const titleMd = song.url ? `## [${cleanTitle}](${song.url})` : `## ${cleanTitle}`;

        let requesterId: string | undefined;
        if (typeof song.requester === 'object' && song.requester !== null) {
            requesterId = song.requester.id;
        } else if (typeof song.requester === 'string') {
            requesterId = song.requester;
        }
        const requesterTag = requesterId ? `<@${requesterId}>` : '未知點播者';
        const trackSubtitle = `🎤 **${cleanAuthor}** • ⏱️ \`${durationText}\`\n👤 ${requesterTag}`;

        const container = new ContainerBuilder()
            .setAccentColor(accentColor)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🎶 正在播放'))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        if (song.thumbnail) {
            const section = new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${titleMd}\n${trackSubtitle}`))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(song.thumbnail));
            container.addSectionComponents(section);
        } else {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${titleMd}\n${trackSubtitle}`));
        }

        if (song.url) {
            container
                .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
                .addActionRowComponents(
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                            .setLabel('前往播放來源')
                            .setEmoji('🔗')
                            .setStyle(ButtonStyle.Link)
                            .setURL(song.url)
                    )
                );
        }

        return { components: [container], flags: MessageFlags.IsComponentsV2 as any };
    }

    /**
     * Build 'Added to Queue' UI payload for a single track.
     * Enforces Level 1 Heading (#) for notification header, Level 2 Heading (##) for track title,
     * Section with Thumbnail accessory, subtext (-#) for position and user, and prevents raw ms leak.
     */
    static async buildAddedToQueueMessage(
        trackInfo: any,
        queueLength: number,
        user: User | any,
        formatDurationFn?: (ms: number) => string
    ): Promise<{ components: any[]; flags: any }> {
        const thumbnailURL =
            trackInfo?.artworkUrl ||
            (trackInfo?.identifier ? `https://img.youtube.com/vi/${trackInfo.identifier}/hqdefault.jpg` : '');
        const formatDur = formatDurationFn || ((ms: number) => this.formatDuration(ms));
        const durationText = formatDur(trackInfo?.length || 0);

        const rawTitle = trackInfo?.title ? String(trackInfo.title) : '未知曲目';
        const cleanTitle = rawTitle.length > 42 ? rawTitle.slice(0, 39) + '...' : rawTitle;
        const rawAuthor = trackInfo?.author ? String(trackInfo.author) : '未知歌手';
        const cleanAuthor = rawAuthor.length > 25 ? rawAuthor.slice(0, 22) + '...' : rawAuthor;
        const userId = user?.id || (typeof user === 'string' ? user : '0');

        const accentColor = await this.computeAccentColor(thumbnailURL);

        const container = new ContainerBuilder()
            .setAccentColor(accentColor)
            // 1. Level 1 True Heading (#) with queue position and requester subtext
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# 📥 已加入播放佇列\n-# 🔢 佇列順序：第 **${queueLength}** 首 • 👤 點播者：<@${userId}>`
                )
            )
            // 2. Separator 1
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        // 3. Hero Section (Track title with Level 2 Heading ## + author + duration)
        const titleMd = trackInfo?.uri ? `## [${cleanTitle}](${trackInfo.uri})` : `## ${cleanTitle}`;
        const trackDetail = `${titleMd}\n🎤 **${cleanAuthor}** • ⏱️ \`${durationText}\``;

        if (thumbnailURL) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(trackDetail))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailURL))
            );
        } else {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(trackDetail));
        }

        // 4. Separator 2
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 5. Helpful tip in subtext
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('-# 💡 提示：輸入 `/queue` 可查看即將播放的完整清單與播控按鈕')
        );

        // 6. Action button (if URI available)
        if (trackInfo?.uri) {
            container.addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setLabel('🔗 前往播放來源').setStyle(ButtonStyle.Link).setURL(trackInfo.uri)
                )
            );
        }

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    /**
     * Build 'Playlist Added' UI payload with True Headings (# and ##) and subtext.
     */
    static buildPlaylistAddedMessage(
        playlistName: string,
        trackCount: number,
        userTag: string
    ): { components: any[]; flags: any } {
        const cleanPlaylistName = playlistName ? String(playlistName).slice(0, 50) : '播放清單';
        const container = new ContainerBuilder()
            .setAccentColor(Colors.Music)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# 📑 已載入播放清單\n-# 🎶 歌曲數量：**${trackCount}** 首 • 👤 點播者：${userTag}`
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `## 🎵 ${cleanPlaylistName}\n-# 💡 提示：所有歌曲已成功加入隊列，輸入 \`/queue\` 可查看清單與順序`
                )
            );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    /**
     * Build interactive Search Selector Card (Scheme A with True Headings).
     * Enforces Level 1 Heading (#) for card title, Level 2 Heading (##) for Hero recommendation,
     * Level 3 Heading (###) for candidate list, and subtext (-#) for auxiliary context.
     */
    static async buildSearchSelectorCard(params: { query: string; tracks: any[]; timeoutSec: number }): Promise<{
        container: ContainerBuilder;
        selectMenu: StringSelectMenuBuilder;
        accentColor: number;
    }> {
        const { query, tracks, timeoutSec } = params;
        const results = (tracks || []).slice(0, 5);

        const topTrack = results[0];
        const rawTopTitle = topTrack?.info?.title ? String(topTrack.info.title) : '未知曲目';
        const cleanTopTitle = rawTopTitle.length > 42 ? rawTopTitle.slice(0, 39) + '...' : rawTopTitle;
        const rawTopAuthor = topTrack?.info?.author ? String(topTrack.info.author) : '未知歌手';
        const cleanTopAuthor = rawTopAuthor.length > 25 ? rawTopAuthor.slice(0, 22) + '...' : rawTopAuthor;
        const topThumb =
            topTrack?.info?.artworkUrl ||
            (topTrack?.info?.identifier ? `https://img.youtube.com/vi/${topTrack.info.identifier}/hqdefault.jpg` : '');
        const topDuration = this.formatDuration(topTrack?.info?.length || 0);
        const topUri = topTrack?.info?.uri;

        const accentColor = await this.computeAccentColor(topThumb);

        const container = new ContainerBuilder().setAccentColor(accentColor);

        // 1. Level 1 True Heading (#) with search context
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# 🔍 音樂搜尋結果\n-# 關鍵字：\`${query}\` • 共找到 ${results.length} 首相關曲目`
            )
        );

        // 2. Separator 1
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 3. Hero Section (Top Track) - Level 2 True Heading (##)
        const topTitleMd = topUri ? `## [${cleanTopTitle}](${topUri})` : `## ${cleanTopTitle}`;
        const heroContent = `💡 **最佳匹配推薦**\n${topTitleMd}\n🎤 **${cleanTopAuthor}** • ⏱️ \`${topDuration}\``;

        if (topThumb) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(heroContent))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(topThumb))
            );
        } else {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(heroContent));
        }

        // 4. Candidate Tracks 2~5 - Level 3 True Heading (###)
        if (results.length > 1) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

            const otherLines = results.slice(1).map((t: any, idx: number) => {
                const rawTitle = t?.info?.title ? String(t.info.title) : '未知曲目';
                const title = rawTitle.length > 38 ? rawTitle.slice(0, 35) + '...' : rawTitle;
                const rawAuthor = t?.info?.author ? String(t.info.author) : '未知歌手';
                const author = rawAuthor.length > 20 ? rawAuthor.slice(0, 17) + '...' : rawAuthor;
                const dur = this.formatDuration(t?.info?.length || 0);
                const uri = t?.info?.uri;
                const link = uri ? `[${title}](${uri})` : title;
                return `**${idx + 2}.** ${link} • ${author} \`[${dur}]\``;
            });

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### 更多候選曲目\n${otherLines.join('\n')}`)
            );
        }

        // 5. Separator 3 & Expiration Subtext (-#)
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# ⏱️ 選單將在 ${timeoutSec} 秒後失效 • 請在下方選單選擇想加入佇列的曲目`
            )
        );

        // 6. Select Menu with rich metadata (duration & author)
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('yt_select')
            .setPlaceholder('點擊選擇想聽的歌曲...')
            .addOptions(
                results.map((t: any, i: number) => {
                    const rawTitle = t?.info?.title ? String(t.info.title) : '未知曲目';
                    const title = `${i + 1}. ${rawTitle}`.slice(0, 100);
                    const author = t?.info?.author ? String(t.info.author).slice(0, 32) : '未知歌手';
                    const dur = this.formatDuration(t?.info?.length || 0);
                    return new StringSelectMenuOptionBuilder()
                        .setLabel(title)
                        .setDescription(`${author} | ⏱️ ${dur}`.slice(0, 50))
                        .setValue(i.toString());
                })
            );

        return { container, selectMenu, accentColor };
    }

    /**
     * Build interactive Queue Dashboard Card (Scheme C with True Headings and Action Controls).
     * Strictly separates Hero Now Playing from full-width upcoming queue, prevents mobile line breaking,
     * enforces Level 1 (#), Level 2 (##), Level 3 (###) Headings and subtext (-#),
     * and equips interactive playback buttons.
     */
    static async buildQueueDashboardCard(params: {
        songs: any[];
        voiceChannelId?: string;
        isPaused?: boolean;
        loopMode?: string;
        formatDurationFn?: (ms: number) => string;
        maxDisplayUpcoming?: number;
    }): Promise<{ components: any[]; flags: any }> {
        const {
            songs,
            voiceChannelId,
            isPaused = false,
            loopMode = 'none',
            formatDurationFn,
            maxDisplayUpcoming = 10
        } = params;

        if (!songs || songs.length === 0) {
            const emptyContainer = new ContainerBuilder()
                .setAccentColor(Colors.Music)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '# 📜 播放清單佇列\n-# 當前沒有任何歌曲在播放，請使用 `/play` 點播歌曲！'
                    )
                );
            return { components: [emptyContainer], flags: MessageFlags.IsComponentsV2 as any };
        }

        const currentSong = songs[0];
        const upcomingSongs = songs.slice(1);
        const formatDur = formatDurationFn || ((ms: number) => this.formatDuration(ms));

        const totalDurationMs = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
        const totalDurationStr = formatDur(totalDurationMs);

        // 1. Accent Color: Extract from current song's thumbnail, or fallback to Colors.Music
        const accentColor = await this.computeAccentColor(currentSong.thumbnail);
        const container = new ContainerBuilder().setAccentColor(accentColor);

        // 2. Top Header (True Level 1 Heading # + subtext metadata)
        const channelTag = voiceChannelId ? `<#${voiceChannelId}>` : '語音頻道';
        const loopLabel = loopMode === 'track' ? '單曲循環' : loopMode === 'queue' ? '全佇列循環' : '關閉';
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# 📜 播放清單佇列\n-# 🔊 頻道：${channelTag} • 總計 **${songs.length}** 首曲目 • 循環：\`${loopLabel}\``
            )
        );

        // 3. Separator 1
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        // 4. Hero Section (Current Playing Track - True Level 2 Heading ##)
        const rawTitle = currentSong.title ? String(currentSong.title) : '未知曲目';
        const cleanTitle = rawTitle.length > 40 ? rawTitle.slice(0, 37) + '...' : rawTitle;
        const rawAuthor = currentSong.author ? String(currentSong.author) : '未知歌手';
        const cleanAuthor = rawAuthor.length > 22 ? rawAuthor.slice(0, 19) + '...' : rawAuthor;
        const curDur = formatDur(currentSong.duration || 0);

        let curRequesterId: string | undefined;
        if (typeof currentSong.requester === 'object' && currentSong.requester !== null) {
            curRequesterId = currentSong.requester.id;
        } else if (typeof currentSong.requester === 'string') {
            curRequesterId = currentSong.requester;
        }
        const curUserTag = curRequesterId ? `<@${curRequesterId}>` : '未知點播者';

        const titleMd = currentSong.url ? `[${cleanTitle}](${currentSong.url})` : cleanTitle;
        const heroContent = `## ▶️ 正在播放\n${titleMd}\n🎤 **${cleanAuthor}** • ⏱️ \`${curDur}\` • 👤 ${curUserTag}`;

        if (currentSong.thumbnail) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(heroContent))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(currentSong.thumbnail))
            );
        } else {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(heroContent));
        }

        // 5. Upcoming Queue Section (Full-width, no thumbnail squeeze!)
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );

        if (upcomingSongs.length > 0) {
            const displayCount = Math.min(upcomingSongs.length, maxDisplayUpcoming);
            const listLines = upcomingSongs.slice(0, displayCount).map((s, idx) => {
                const num = `0${idx + 1}`.slice(-2);
                const rawUpTitle = s.title ? String(s.title) : '未知曲目';
                const upTitle = rawUpTitle.length > 36 ? rawUpTitle.slice(0, 33) + '...' : rawUpTitle;
                const dur = formatDur(s.duration || 0);
                const reqId = s.requester?.id || (typeof s.requester === 'string' ? s.requester : null);
                const user = reqId ? `<@${reqId}>` : '未知';
                const link = s.url ? `[${upTitle}](${s.url})` : upTitle;
                return `\`${num}\` **${link}** • \`[${dur}]\` (${user})`;
            });

            let queueBody = `### ⏳ 即將播放 (接下來 ${displayCount} 首)\n${listLines.join('\n')}`;
            if (upcomingSongs.length > displayCount) {
                queueBody += `\n-# 以及還有 ${upcomingSongs.length - displayCount} 首歌曲在佇列中...`;
            }

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(queueBody));
        } else {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '### ⏳ 即將播放\n-# 佇列目前沒有其他待播歌曲，可點擊下方「➕ 點歌」按鈕添加！'
                )
            );
        }

        // 6. Separator 3 & Stats Footer
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        );
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# 📊 佇列總計：**${songs.length}** 首歌 • 總時長：\`${totalDurationStr}\``
            )
        );

        // 7. Interactive ActionRow (Playback Control Buttons)
        const isLoopActive = loopMode === 'track' || loopMode === 'queue';
        const loopBtnLabel = loopMode === 'track' ? '單曲' : loopMode === 'queue' ? '佇列' : '循環';
        const loopBtnEmoji = loopMode === 'track' ? '🔂' : '🔁';

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('music:toggle_pause')
                .setLabel(isPaused ? '繼續' : '暫停')
                .setEmoji(isPaused ? '▶️' : '⏸️')
                .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('music:skip')
                .setLabel('略過')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('music:loop:cycle')
                .setLabel(loopBtnLabel)
                .setEmoji(loopBtnEmoji)
                .setStyle(isLoopActive ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('music:open_play_modal')
                .setLabel('點歌')
                .setEmoji('➕')
                .setStyle(ButtonStyle.Secondary)
        );

        if (currentSong.url) {
            actionRow.addComponents(
                new ButtonBuilder().setLabel('來源').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(currentSong.url)
            );
        }

        container.addActionRowComponents(actionRow);

        return { components: [container], flags: MessageFlags.IsComponentsV2 as any };
    }

    /**
     * Map low-level audio stream/Lavalink exceptions into friendly human-readable reasons.
     * Prevents raw Java stack traces and internal architecture details from leaking to users.
     */
    static resolveFriendlyTrackError(rawMessage?: string): string {
        const msg = String(rawMessage || '').toLowerCase();
        if (/timeout|timed out|sockettimeoutexception/i.test(msg)) {
            return '連線逾時：音訊來源伺服器響應過慢，網路連線不穩定';
        }
        if (/login|sign in|age|confirm your age/i.test(msg)) {
            return 'YouTube 限制：此曲目需要年齡驗證或登入帳號才能播放';
        }
        if (/geo|country|region|not available in your country/i.test(msg)) {
            return '地區限制：此曲目因版權政策無法在當前地區播放';
        }
        if (/no supported audio streams|formats\.getbestformat/i.test(msg)) {
            return '音訊串流無效：找不到可播放的音軌，建議搜尋其他版本';
        }
        if (/all clients failed/i.test(msg)) {
            return 'YouTube 限制：此曲目可能受到版權保護或暫時受限無法取得串流';
        }
        if (/unavailable|private video|removed|deleted/i.test(msg)) {
            return '曲目不可用：該影片已被設為私人、刪除或無法存取';
        }
        return '音訊串流載入失敗，無法解析此曲目';
    }

    /**
     * Build user-friendly 'Track Playback Failed' CV2 error card.
     * Sanitizes raw Java stack traces into a clean, modern Discord Component V2 container.
     */
    static buildTrackExceptionMessage(
        song?: { title?: string; url?: string; thumbnail?: string } | null,
        rawReason?: string
    ): { components: any[]; flags: any } {
        const friendlyReason = this.resolveFriendlyTrackError(rawReason);
        const rawTitle = song?.title || '當前曲目';
        const cleanTitle = rawTitle.length > 45 ? rawTitle.slice(0, 42) + '...' : rawTitle;
        const titleMd = song?.url ? `**[${cleanTitle}](${song.url})**` : `**${cleanTitle}**`;

        const container = new ContainerBuilder()
            .setAccentColor(Colors.Error)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${Emojis.Warning} 略過無法播放的曲目`))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        const bodyContent = `無法播放：${titleMd}\n原因：${friendlyReason}，已自動為你跳過並載入下一首曲目。`;

        if (song?.thumbnail) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyContent))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(song.thumbnail))
            );
        } else {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyContent));
        }

        return {
            components: [container],
            flags: MessageFlags.IsComponentsV2 as any
        };
    }

    /**
     * Format milliseconds into standard time string (H:MM:SS or M:SS), formatting 0 as 0:00.
     */
    static formatTime(ms: number, forceHours: boolean = false): string {
        const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const hours = Math.floor(minutes / 60);

        const m = minutes % 60;
        const s = seconds < 10 ? `0${seconds}` : seconds;

        if (hours > 0 || forceHours) {
            return `${hours}:${m < 10 ? `0${m}` : m}:${s}`;
        }
        return `${m}:${s}`;
    }

    /**
     * Format milliseconds into standard time string (H:MM:SS or M:SS).
     * Returns '直播流' if total track duration is 0.
     */
    static formatDuration(ms: number): string {
        if (ms === 0) return '直播流';
        return this.formatTime(ms);
    }

    /**
     * Build text progress bar for audio playback.
     */
    static createProgressBar(current: number, total: number, size: number = 15): string {
        if (!total || total <= 0) {
            return `🔴 直播流 (\`${this.formatTime(current || 0)}\`)`;
        }
        const hasHours = total >= 3600000;
        const safeCurrent = Math.max(0, Math.min(current || 0, total));
        const progress = Math.round((size * safeCurrent) / total);
        const emptyProgress = Math.max(0, size - progress);

        const progressText = '▇'.repeat(Math.max(0, Math.min(progress, size)));
        const emptyProgressText = '—'.repeat(emptyProgress);

        return `\`${this.formatTime(safeCurrent, hasHours)}\` [${progressText}🔘${emptyProgressText}] \`${this.formatTime(total, hasHours)}\``;
    }
}

export default MusicPresenter;
