export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
    [key: string]: any;
}

/**
 * BaseTool — Abstract Base Strategy for AI Functions.
 * Follows Strategy Pattern & Open-Closed Principle (OCP).
 */
class BaseTool {
    /**
     * Tool definition object for OpenAI-compatible API tools schema.
     */
    get definition(): ToolDefinition {
        throw new Error('[BaseTool] definition must be implemented by subclass.');
    }

    /**
     * Execute the tool with given arguments.
     * @param args - Arguments passed by LLM function call
     * @param context - Execution context (e.g. client, channel)
     * @returns Output string to return to LLM
     */
    async execute(_args: any, _context: any = {}): Promise<string> {
        throw new Error('[BaseTool] execute() must be implemented by subclass.');
    }
}

export default BaseTool;
