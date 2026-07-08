const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageCreate,
    async execute(message, bot) {
        if (message.author.bot) return;

        // Fetch partial message and channel to ensure proper operations in DM
        if (message.partial) {
            try {
                await message.fetch();
            } catch (error) {
                console.error('[Event: messageCreate] Failed to fetch partial message:', error);
                return;
            }
        }

        if (message.channel && message.channel.partial) {
            try {
                await message.channel.fetch();
            } catch (error) {
                console.error('[Event: messageCreate] Failed to fetch partial channel:', error);
                return;
            }
        }

        const isDM = !message.guild;
        const isMentioned = message.mentions.has(bot.user.id);

        if (!isDM && message.content) {
            const ttsSettings = bot.settings.get(message.guild.id, 'tts');
            if (ttsSettings && ttsSettings.channelId === message.channel.id) {
                // Find a voice channel with users
                let targetVc = message.guild.members.me.voice.channel;
                if (!targetVc) {
                    const channels = message.guild.channels.cache.filter(c => c.isVoiceBased());
                    targetVc = channels.find(c => c.members.filter(m => !m.user.bot).size > 0);
                }

                if (targetVc) {
                    const userName = message.member?.displayName || message.author.username;
                    // Remove custom emojis and use cleanContent
                    let cleanText = message.cleanContent.replace(/<a?:.+?:\d+>/g, '').trim();
                    if (cleanText) {
                        const textToSpeak = `${userName}說：${cleanText}`.slice(0, 200);

                        try {
                            const googleTTS = require('google-tts-api');
                            const url = googleTTS.getAudioUrl(textToSpeak, {
                                lang: ttsSettings.lang || 'zh-TW',
                                slow: false,
                                host: 'https://translate.google.com'
                            });

                            bot.music.search(url).then(async ({ tracks }) => {
                                if (tracks && tracks.length > 0) {
                                    const track = tracks[0];
                                    track.info.title = `TTS: ${textToSpeak}`;
                                    track.info.author = `Language: ${ttsSettings.lang || 'zh-TW'}`;
                                    await bot.music.play(targetVc, message.channel, track, message.author, { isTTS: true });
                                }
                            }).catch(err => console.error('[Automatic TTS Search Error]', err.message));
                        } catch (err) {
                            console.error('[Automatic TTS Error]', err.message);
                        }
                    }
                }
            }
        }

        if (!isDM && !isMentioned) {
            // Passive Context Reading
            const userName = message.member?.displayName || message.author.username;
            if (bot.ai) {
                bot.ai.addPassiveContext(message.channel.id, userName, message.content);
            }
            return;
        }

        if (isDM || isMentioned) {
            let userMessage = message.content;
            if (isMentioned) {
                userMessage = userMessage.replace(new RegExp(`<@!?${bot.user.id}>`), '').trim();
            } else {
                userMessage = userMessage.trim();
            }

            const imageAttachments = message.attachments.filter((a) => a.contentType?.startsWith('image/'));

            if (!userMessage && imageAttachments.size === 0) return;

            await message.channel.sendTyping().catch((e) => console.warn('Ignored error:', e.message));

            // 1. Send a placeholder message BEFORE starting the AI
            let aiMessage = await message.reply({
                content: '🤔 思考中...',
                allowedMentions: { parse: [] }
            });

            let lastEditTime = 0;
            let isRequestingDiscord = false;

            try {
                const userName = message.member?.displayName || message.author.username;

                let images = [];
                if (imageAttachments.size > 0) {
                    for (const attachment of imageAttachments.values()) {
                        const base64 = await bot.ai.urlToBase64(attachment.url);
                        if (base64) images.push(base64);
                    }
                }

                // 2. Call generateResponse and ONLY edit the placeholder
                const finalReply = await bot.ai.generateResponse(
                    userMessage,
                    message.channel.id,
                    userName,
                    async (currentText) => {
                        const now = Date.now();

                        // Throttle: Only update Discord at most once every 2 seconds to avoid rate limits
                        if (now - lastEditTime > 2000 && !isRequestingDiscord && currentText.trim()) {
                            lastEditTime = now;
                            isRequestingDiscord = true;

                            try {
                                // We simply edit the existing placeholder message now
                                await aiMessage.edit({
                                    content: currentText + ' ✍️',
                                    allowedMentions: { parse: [] }
                                });
                            } catch (e) {
                                console.error('[AI Stream] Discord Edit Error:', e.message);
                            } finally {
                                isRequestingDiscord = false;
                            }
                        }
                    },
                    images
                );

                // 3. Ensure the final, complete response is applied without the ✍️ icon
                await aiMessage.edit({
                    content: finalReply,
                    allowedMentions: { parse: [] }
                });
            } catch (error) {
                console.warn('[AI Routing]', error.message);

                // Edit the placeholder message to show the error, or fallback to reply
                if (aiMessage) {
                    await aiMessage
                        .edit({ content: '抱歉，我思考的時候短路了！😵‍💫', allowedMentions: { parse: [] } })
                        .catch((e) => console.warn('Ignored error:', e.message));
                } else {
                    message
                        .reply('抱歉，我思考的時候短路了！😵‍💫')
                        .catch((e) => console.warn('Ignored error:', e.message));
                }
            }
        }
    }
};
