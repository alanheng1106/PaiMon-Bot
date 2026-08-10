const BaseTool = require('./BaseTool');

/**
 * WebSearchTool — Tool strategy for real-time web searching via Serper API.
 */
class WebSearchTool extends BaseTool {
    get definition() {
        return {
            type: 'function',
            function: {
                name: 'web_search',
                description: 'Search the entire web to find real-time information, news, or facts.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'The search query to look up on Google.'
                        }
                    },
                    required: ['query']
                }
            }
        };
    }

    async execute(args, context = {}) {
        const { query } = args;
        const key = process.env.SERPER_API_KEY;
        if (!key) return 'Error: SERPER_API_KEY is not configured in .env.';

        if (context.onUpdate) {
            context.onUpdate(`*(🔍 正在搜尋網頁: ${query}...)*`);
        }

        try {
            const response = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: {
                    'X-API-KEY': key,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ q: query })
            });
            const data = await response.json();

            if (!data.organic || data.organic.length === 0) return 'No results found on the web.';

            return data.organic
                .slice(0, 4)
                .map((item) => `[${item.title}] ${item.snippet}`)
                .join('\n\n');
        } catch (error) {
            return `Search failed: ${error.message}`;
        }
    }
}

module.exports = WebSearchTool;
