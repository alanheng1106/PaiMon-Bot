const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const { Colors } = require('../../config');
const { getAverageColor } = require('fast-average-color-node');

/**
 * MusicPresenter — Encapsulates Discord UI card rendering for music events.
 * Keeps presentation concerns isolated from audio playback domain logic (SRP).
 */
class MusicPresenter {
    /**
     * Compute average color from a thumbnail URL, returning fallback hex on failure.
     * @param {string} thumbnailUrl 
     * @returns {Promise<number>}
     */
    static async computeAccentColor(thumbnailUrl) {
        if (!thumbnailUrl) return Colors.Music;
        try {
            const colorData = await getAverageColor(thumbnailUrl);
            if (colorData && colorData.hex) {
                return parseInt(colorData.hex.slice(1), 16);
            }
        } catch (err) {
            // Ignore color extraction errors
        }
        return Colors.Music;
    }

    /**
     * Build 'Now Playing' UI payload.
     */
    static async buildNowPlayingMessage(song, voiceChannelId, formatDurationFn) {
        const durationText = formatDurationFn ? formatDurationFn(song.duration) : `${song.duration} ms`;
        const content = `**🎵 歌名**\n${song.title}\n\n**🎤 歌手**\n${song.author}\n\n**⏱️ 時長**\n${durationText}\n\n**👤 點播者**\n<@${song.requester.id}>\n\n**🔊 語音頻道**\n<#${voiceChannelId}>`;
        
        const accentColor = await this.computeAccentColor(song.thumbnail);

        const container = new ContainerBuilder()
            .setAccentColor(accentColor)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🎶 正在播放`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(song.thumbnail))
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('🔗 前往播放來源')
                        .setStyle(ButtonStyle.Link)
                        .setURL(song.url)
                )
            );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    /**
     * Build 'Added to Queue' UI payload for a single track.
     */
    static async buildAddedToQueueMessage(trackInfo, queueLength, user, formatDurationFn) {
        const thumbnailURL = trackInfo.artworkUrl || `https://img.youtube.com/vi/${trackInfo.identifier}/hqdefault.jpg`;
        const durationText = formatDurationFn ? formatDurationFn(trackInfo.length) : `${trackInfo.length} ms`;
        
        const content = `**🎵 歌名**\n${trackInfo.title}\n\n**🎤 歌手**\n${trackInfo.author}\n\n**⏱️ 時長**\n${durationText}\n\n**🔢 佇列位置**\n第 ${queueLength} 首\n\n**👤 點播者**\n<@${user.id}>`;
        const thumbnail = new ThumbnailBuilder().setURL(thumbnailURL);
        const accentColor = await this.computeAccentColor(thumbnailURL);

        const container = new ContainerBuilder()
            .setAccentColor(accentColor)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <a:check:1524601509772529665> 已加入播放佇列`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                    .setThumbnailAccessory(thumbnail)
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('🔗 前往播放來源')
                        .setStyle(ButtonStyle.Link)
                        .setURL(trackInfo.uri)
                )
            );

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    /**
     * Build 'Playlist Added' UI payload.
     */
    static buildPlaylistAddedMessage(playlistName, trackCount, userTag) {
        const content = `**${playlistName}**\n\n**🎶 歌曲數量**\n${trackCount} 首\n\n**👤 點播者**\n${userTag}`;
        const container = new ContainerBuilder()
            .setAccentColor(Colors.Music)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <a:check:1524601509772529665> 已加載整個播放清單`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }
}

module.exports = MusicPresenter;
