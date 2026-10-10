import BaseTool, { ToolDefinition } from './BaseTool';

/**
 * GetCurrentTimeTool — Tool strategy for retrieving current system date and time.
 */
class GetCurrentTimeTool extends BaseTool {
    override get definition(): ToolDefinition {
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

    override async execute(_args: any, _context: any = {}): Promise<string> {
        const now = new Date().toLocaleString('zh-TW', { hour12: false });
        return `當前系統時間: ${now}`;
    }
}

export default GetCurrentTimeTool;
