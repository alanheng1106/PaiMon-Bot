import BaseTool, { ToolDefinition } from './BaseTool';
import { Emojis } from '../../config';

/**
 * WebSearchTool — Tool strategy for real-time web searching via Serper API.
 */
class WebSearchTool extends BaseTool {
    override get definition(): ToolDefinition {
        return {
            type: 'function',
            function: {
                name: 'web_search',
                description:
                    'Search the live web to retrieve real-time information, latest news, current facts, and recent data. Always use this tool when answering questions about current events, latest developments, real-time facts, or when information may be outdated.',
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

    override async execute(args: { query: string } | any, context: any = {}): Promise<string> {
        let rawQuery = args?.query || '';
        // Sanitize any leaked DeepSeek DSML markup or internal protocol tags
        if (typeof rawQuery === 'string') {
            rawQuery = rawQuery
                .replace(/<\/?[|｜]{1,2}DSML[|｜]{1,2}[^>]*>/gi, '')
                .replace(/<[|｜]{1,2}[^>]*[|｜]{1,2}>/gi, '')
                .trim();
        }
        const query = rawQuery;

        const key = process.env.SERPER_API_KEY;
        if (!key) return 'Error: SERPER_API_KEY is not configured in .env.';

        if (!query) return 'No search query provided.';

        if (context.onUpdate) {
            context.onUpdate(`${Emojis.Loading} *(正在搜尋網頁: ${query}...)*`);
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
            const data: any = await response.json();

            if (!data.organic || data.organic.length === 0) return 'No results found on the web.';

            return data.organic
                .slice(0, 4)
                .map((item: any) => `[${item.title}] ${item.snippet}`)
                .join('\n\n');
        } catch (error: any) {
            return `Search failed: ${error.message}`;
        }
    }
}

export default WebSearchTool;
