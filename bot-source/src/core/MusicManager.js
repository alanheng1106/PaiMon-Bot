const { Shoukaku, Connectors } = require('shoukaku');
const { EmbedBuilder } = require('discord.js');
const { Colors } = require('../config');

class MusicManager {
    constructor(bot) {
        this.bot = bot; // Back-reference to BotClient
        this.queues = new Map();

        // Combine the HOST and PORT, falling back to lavalink:2333 if not found
        const host = process.env.LAVALINK_HOST || 'lavalink';
        const port = process.env.LAVALINK_PORT || '2333';

        const nodes = [{
            name: 'Docker-Lavalink',
            url: `${host}:${port}`,
            auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass', // Also ensure this matches your .env variable name!
            secure: process.env.LAVALINK_SECURE === 'true'
        }];

        this.shoukaku = new Shoukaku(new Connectors.DiscordJS(this.bot), nodes, {
            moveOnDisconnect: true,
            reconnectTries: 5,
            reconnectInterval: 5000
        });

        this.shoukaku.on('error', (node, err) => console.warn(`[Node Error] ${node}: ${err.message}`));
        this.shoukaku.on('ready', (node) => console.log(`[Music] Audio Node Synced: ${node}`));
    }

    async search(query) {
        const node = this.shoukaku.options.nodeResolver(this.shoukaku.nodes);
        if (!node) throw new Error('Music servers are currently offline.');

        const searchUrl = query.startsWith('http') ? query : `ytsearch:${query}`;
        const result = await node.rest.resolve(searchUrl);


        if (!result?.data) return { isPlaylist: false, tracks: [] };
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
                if (q) { q.songs.shift(); this.processQueue(guild.id); }
            };

            player.on('end', next);
            player.on('error', (err) => { console.error('[Play Error]', err); next(); });
            player.on('closed', () => this.queues.delete(guild.id));

            this.queues.set(guild.id, { player, songs: [], textChannel });
        }
        const q = this.queues.get(guild.id);
        q.textChannel = textChannel;
        return q;
    }

    async processQueue(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue) return;

        if (!queue.songs.length) {
            const embed = new EmbedBuilder()
                .setColor(Colors.Primary)
                .setDescription('🎶 播放佇列已結束');
            queue.textChannel?.send({ embeds: [embed] }).catch(() => { });
            return;
        }

        const song = queue.songs[0];
        try {
            await queue.player.playTrack({ track: { encoded: song.encoded } });
            const embed = new EmbedBuilder()
                .setColor(Colors.Primary)
                .setTitle('▶️ 正在播放')
                .setDescription(`[${song.title}](${song.url}) - *${song.author}*`);
            queue.textChannel?.send({ embeds: [embed] }).catch(() => { });

        } catch {
            queue.songs.shift();
            this.processQueue(guildId);
        }
    }

    async play(voiceChannel, textChannel, track, user) {
        const queue = await this._ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
        const wasEmpty = !queue.songs.length;

        queue.songs.push({
            title: track.info.title,
            author: track.info.author,
            url: track.info.uri,
            encoded: track.encoded,
            duration: track.info.length,
            thumbnail: track.info.artworkUrl || `https://img.youtube.com/vi/${track.info.identifier}/hqdefault.jpg`,
            requester: { tag: user.tag, id: user.id }
        });

        if (wasEmpty) await this.processQueue(voiceChannel.guild.id);
        else {
            const embed = new EmbedBuilder()
                .setColor(Colors.Primary)
                .setTitle('✅ 已加入播放佇列')
                .setDescription(`[${track.info.title}](${track.info.uri})`)
                .setThumbnail(track.info.artworkUrl || `https://img.youtube.com/vi/${track.info.identifier}/hqdefault.jpg`)
                .addFields(
                    { name: '👤 歌手', value: track.info.author, inline: true },
                    { name: '⏱️ 時長', value: this.formatDuration(track.info.length), inline: true },
                    { name: '🔢 佇列位置', value: `${queue.songs.length}`, inline: true }
                )
                .setFooter({ text: `由 ${user.tag} 點播`, iconURL: user.displayAvatarURL() });

            textChannel.send({ embeds: [embed] }).catch(() => { });
        }
    }

    async playPlaylist(voiceChannel, textChannel, playlistName, tracks, user) {
        const queue = await this._ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
        const wasEmpty = !queue.songs.length;

        tracks.forEach(t => queue.songs.push({
            title: t.info.title,
            author: t.info.author,
            url: t.info.uri,
            encoded: t.encoded,
            duration: t.info.length,
            thumbnail: t.info.artworkUrl || `https://img.youtube.com/vi/${t.info.identifier}/hqdefault.jpg`,
            requester: { tag: user.tag, id: user.id }
        }));

        const embed = new EmbedBuilder()
            .setColor(Colors.Primary)
            .setTitle('📖 已加載整個播放清單')
            .setDescription(`**${playlistName}**`)
            .addFields(
                { name: '🎶 歌曲數量', value: `${tracks.length} 首`, inline: true },
                { name: '👤 點播者', value: user.tag, inline: true }
            )
            .setFooter({ text: `Requested by ${user.tag}`, iconURL: user.displayAvatarURL() });

        textChannel.send({ embeds: [embed] }).catch(() => { });
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

    getQueue(guildId) { return this.queues.get(guildId); }
    stop(guildId) { const q = this.queues.get(guildId); if (q) { q.songs = []; q.player.stopTrack(); } }
    skip(guildId) { this.queues.get(guildId)?.player?.stopTrack(); }
    pause(guildId) { this.queues.get(guildId)?.player?.setPaused(true); }
    resume(guildId) { this.queues.get(guildId)?.player?.setPaused(false); }
    setVolume(guildId, volume) { this.queues.get(guildId)?.player?.setGlobalVolume(volume); }

    async join(voiceChannel, textChannel) {
        return await this._ensureSession(voiceChannel.guild, voiceChannel.id, textChannel);
    }

    leave(guildId) {
        this.shoukaku.leaveVoiceChannel(guildId);
        this.queues.delete(guildId);
    }

}

module.exports = MusicManager;
