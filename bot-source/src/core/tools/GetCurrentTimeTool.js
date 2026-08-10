const BaseTool = require('./BaseTool');

/**
 * GetCurrentTimeTool — Tool strategy for retrieving current system date and time.
 */
class GetCurrentTimeTool extends BaseTool {
    get definition() {
        return {
            type: 'function',
            function: {
                name: 'get_current_time',
                description: 'Get the current system date and time.',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        };
    }

    async execute(args, context = {}) {
        const now = new Date().toLocaleString('zh-TW', { hour12: false });
        return `當前系統時間: ${now}`;
    }
}

module.exports = GetCurrentTimeTool;
