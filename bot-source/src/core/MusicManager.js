const { Shoukaku, Connectors } = require('shoukaku');
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { Colors, Music: MusicConfig } = require('../config');
const { getAverageColor } = require('fast-average-color-node');

class MusicManager {
    constructor(bot) {
        this.bot = bot; // Back-reference to BotClient
        this.queues = new Map();

        // Combine the HOST and PORT, falling back to lavalink:2333 if not found
        const host = process.env.LAVALINK_HOST || 'lavalink';
        const port = process.env.LAVALINK_PORT || '2333';

        const nodes = [
            {
                name: 'Docker-Lavalink',
                url: `${host}:${port}`,
                auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass', // Also ensure this matches your .env variable name!
                secure: process.env.LAVALINK_SECURE === 'true'
            }
        ];

        this.shoukaku = new Shoukaku(new Connectors.DiscordJS(this.bot), nodes, {
            moveOnDisconnect: true,
            reconnectTries: MusicConfig.ReconnectTries,
            reconnectInterval: MusicConfig.ReconnectIntervalMs
        });

        this.shoukaku.on('error', (node, err) => console.warn(`[Node Error] ${node}: ${err.message}`));
        this.shoukaku.on('ready', (node) => console.log(`[Music] Audio Node Synced: ${node}`));
    }

    async search(query) {
        const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
        if (!node) throw new Error('Music servers are currently offline.');

        const searchUrl = query.startsWith('http') ? query : `ytsearch:${query}`;
        const result = await node.rest.resolve(searchUrl);

        if (!result || result.loadType === 'empty' || result.loadType === 'error' || !result.data) {
            return { isPlaylist: false, tracks: [] };
        }
        if (result.loadType === 'playlist') {
            return { isPlaylist: true, name: result.data.info.name, tracks: result.data.tracks };
        }
        return { isPlaylist: false, tracks: result.loadType === 'search' ? result.data : [result.data] };
    }

    async _ensureSession(guild, channelId, textChannel) {
        if (!this.queues.has(guild.id)) {
            const player = await this.shoukaku.joinVoiceChannel({
                guildId: guild.id,
                channelId,
                shardId: guild.shardId || 0
            });

            const next = () => {
                const q = this.queues.get(guild.id);
                if (!q) return;

                const finishedSong = q.songs[0];
                if (finishedSong) {
                    q.lastSongIsTTS = finishedSong.isTTS;

                    if (q.loop === 'track') {
                        // Keep song at index 0, replay it
                    } else if (q.loop === 'queue' && !finishedSong.isTTS) {
                        // Move finished song to end of queue for continuous loop
                        q.songs.shift();
                        q.songs.push(finishedSong);
                    } else {
                        // Default: remove the finished song
                        q.songs.shift();
                    }
                }
                this.processQueue(guild.id);
            };

            player.on('end', next);
            player.on('error', (err) => {
                console.error('[Play Error]', err);
                next();
            });
            player.on('closed', () => this.queues.delete(guild.id));

            this.queues.set(guild.id, { player, songs: [], textChannel, voiceChannelId: channelId, loop: 'none' });

            // Restore saved volume from settings
            const savedVolume = this.bot.settings?.get(guild.id, 'volume');
            if (savedVolume) player.setGlobalVolume(savedVolume);
        }
        const q = this.queues.get(guild.id);
        q.textChannel = textChannel;
        return q;
    }

    async processQueue(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue) return;

        if (!queue.songs.length) {
            // Queue is empty, just return without sending a redundant message.
            return;
        }

        const song = queue.songs[0];
        try {
            await queue.player.playTrack({ track: { encoded: song.encoded } });
            if (song.resumePosition) {
                await queue.player.seekTo(song.resumePosition);
            }
            if (!song.isTTS && !song.resumePosition && queue.loop !== 'track') {
                const content = `**🎵 歌名**\n${song.title}\n\n**🎤 歌手**\n${song.author}\n\n**⏱️ 時長**\n${this.formatDuration(song.duration)}\n\n**👤 點播者**\n<@${song.requester.id}>\n\n**🔊 語音頻道**\n<#${queue.voiceChannelId}>`;
                
                let accentColor = Colors.Primary;
                try {
                    const colorData = await getAverageColor(song.thumbnail);
                    if (colorData && colorData.hex) {
                        accentColor = parseInt(colorData.hex.slice(1), 16);
                    }
                } catch (err) {
                    // Ignore color extraction errors
                }

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
                queue.textChannel?.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch((e) => console.warn('Ignored error:', e.message));
            }
        } catch (err) {
            console.warn(`[MusicManager] Failed to play track in guild ${guildId}:`, err.message);
            queue.songs.shift();
            this.processQueue(guildId);
        }
    }

    async play(voiceChannel, textChannel, track, user, options = {}) {
        const queue = await this._ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
        const wasEmpty = !queue.songs.length;

        const newSong = {
            title: track.info.title,
            author: track.info.author,
            url: track.info.uri,
            encoded: track.encoded,
            duration: track.info.length,
            thumbnail: track.info.artworkUrl || `https://img.youtube.com/vi/${track.info.identifier}/hqdefault.jpg`,
            requester: { tag: user.tag, id: user.id },
            isTTS: options.isTTS || false
        };

        if (options.isTTS && !wasEmpty) {
            if (!queue.songs[0].isTTS) {
                const songToResume = { ...queue.songs[0], resumePosition: queue.player.position || 0 };
                queue.songs.splice(1, 0, newSong, songToResume);
                queue.player.stopTrack();
            } else {
                let insertIndex = 1;
                while (insertIndex < queue.songs.length && queue.songs[insertIndex].isTTS) {
                    insertIndex++;
                }
                queue.songs.splice(insertIndex, 0, newSong);
            }
            return;
        }

        queue.songs.push(newSong);

        if (wasEmpty) await this.processQueue(voiceChannel.guild.id);
        else if (!options.isTTS) {
            const content = `**🎵 歌名**\n${track.info.title}\n\n**🎤 歌手**\n${track.info.author}\n\n**⏱️ 時長**\n${this.formatDuration(track.info.length)}\n\n**🔢 佇列位置**\n第 ${queue.songs.length} 首\n\n**👤 點播者**\n<@${user.id}>`;
            const thumbnailURL = track.info.artworkUrl || `https://img.youtube.com/vi/${track.info.identifier}/hqdefault.jpg`;
            const thumbnail = new ThumbnailBuilder().setURL(thumbnailURL);

            let accentColor = Colors.Primary;
            try {
                const colorData = await getAverageColor(thumbnailURL);
                if (colorData && colorData.hex) {
                    accentColor = parseInt(colorData.hex.slice(1), 16);
                }
            } catch (err) {
                // Ignore color extraction errors
            }

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
                            .setURL(track.info.uri)
                    )
                );

            textChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch((e) => console.warn('Ignored error:', e.message));
        }
    }

    async playPlaylist(voiceChannel, textChannel, playlistName, tracks, user) {
        const queue = await this._ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
        const wasEmpty = !queue.songs.length;

        tracks.forEach((t) =>
            queue.songs.push({
                title: t.info.title,
                author: t.info.author,
                url: t.info.uri,
                encoded: t.encoded,
                duration: t.info.length,
                thumbnail: t.info.artworkUrl || `https://img.youtube.com/vi/${t.info.identifier}/hqdefault.jpg`,
                requester: { tag: user.tag, id: user.id }
            })
        );

        const content = `**${playlistName}**\n\n**🎶 歌曲數量**\n${tracks.length} 首\n\n**👤 點播者**\n${user.tag}`;
        const container = new ContainerBuilder()
            .setAccentColor(Colors.Primary)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### <a:check:1524601509772529665> 已加載整個播放清單`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        textChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch((e) => console.warn('Ignored error:', e.message));
        if (wasEmpty) await this.processQueue(voiceChannel.guild.id);
    }

    formatDuration(ms) {
        if (ms === 0) return '直播流';
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const hours = Math.floor(minutes / 60);

        const m = minutes % 60;
        const s = seconds < 10 ? `0${seconds}` : seconds;

        if (hours > 0) return `${hours}:${m < 10 ? `0${m}` : m}:${s}`;
        return `${m}:${s}`;
    }

    createProgressBar(current, total, size = 15) {
        const progress = Math.round((size * current) / total);
        const emptyProgress = size - progress;

        const progressText = '▇'.repeat(Math.max(0, progress));
        const emptyProgressText = '—'.repeat(Math.max(0, emptyProgress));

        const percentage = Math.round((current / total) * 100);
        return `\`${this.formatDuration(current)}\` [${progressText}🔘${emptyProgressText}] \`${this.formatDuration(total)}\``;
    }

    getQueue(guildId) {
        return this.queues.get(guildId);
    }
    stop(guildId) {
        const q = this.queues.get(guildId);
        if (q) {
            q.songs = [];
            q.loop = 'none';
            q.player.stopTrack();
        }
    }
    skip(guildId) {
        this.queues.get(guildId)?.player?.stopTrack();
    }
    pause(guildId) {
        this.queues.get(guildId)?.player?.setPaused(true);
    }
    resume(guildId) {
        this.queues.get(guildId)?.player?.setPaused(false);
    }
    setVolume(guildId, volume) {
        this.queues.get(guildId)?.player?.setGlobalVolume(volume);
    }

    async join(voiceChannel, textChannel) {
        return await this._ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
    }

    leave(guildId) {
        this.shoukaku.leaveVoiceChannel(guildId);
        this.queues.delete(guildId);
    }
}

module.exports = MusicManager;
