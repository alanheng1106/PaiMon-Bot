const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user, bot) {
        const router = bot?.container?.get('reactionRouter') || bot?.reactionRouter;
        if (router) {
            await router.handle({ reaction, user, bot });
        }
    }
};
