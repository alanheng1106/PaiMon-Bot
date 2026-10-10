import BaseTool, { ToolDefinition } from './BaseTool';

/**
 * ToolRegistry — Registry for AI Tool Strategy Objects.
 * Allows dynamic registration and dispatching of tool calls.
 */
class ToolRegistry {
    #tools = new Map<string, BaseTool>();

    /**
     * Register a tool strategy instance.
     */
    register(tool: BaseTool): this {
        if (!(tool instanceof BaseTool)) {
            throw new TypeError('[ToolRegistry] Registered tool must extend BaseTool.');
        }
        const name = tool.definition.function.name;
        this.#tools.set(name, tool);
        return this;
    }

    /**
     * Retrieve all registered tool definitions for LLM API call.
     */
    getDefinitions(): ToolDefinition[] {
        return Array.from(this.#tools.values()).map((t) => t.definition);
    }

    /**
     * Check if a tool exists in the registry.
     */
    has(name: string): boolean {
        return this.#tools.has(name);
    }

    /**
     * Execute a registered tool strategy.
     */
    async execute(name: string, args: any, context: any = {}): Promise<string> {
        const tool = this.#tools.get(name);
        if (!tool) {
            return `Error: Unknown tool '${name}'.`;
        }
        return await tool.execute(args, context);
    }
}

export default ToolRegistry;
