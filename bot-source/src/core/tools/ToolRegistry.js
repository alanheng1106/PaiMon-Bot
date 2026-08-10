const BaseTool = require('./BaseTool');

/**
 * ToolRegistry — Registry for AI Tool Strategy Objects.
 * Allows dynamic registration and dispatching of tool calls.
 */
class ToolRegistry {
    #tools = new Map();

    /**
     * Register a tool strategy instance.
     * @param {BaseTool} tool 
     */
    register(tool) {
        if (!(tool instanceof BaseTool)) {
            throw new TypeError('[ToolRegistry] Registered tool must extend BaseTool.');
        }
        const name = tool.definition.function.name;
        this.#tools.set(name, tool);
        return this;
    }

    /**
     * Retrieve all registered tool definitions for LLM API call.
     * @returns {Array<Object>}
     */
    getDefinitions() {
        return Array.from(this.#tools.values()).map((t) => t.definition);
    }

    /**
     * Check if a tool exists in the registry.
     * @param {string} name 
     * @returns {boolean}
     */
    has(name) {
        return this.#tools.has(name);
    }

    /**
     * Execute a registered tool strategy.
     * @param {string} name 
     * @param {Object} args 
     * @param {Object} context 
     * @returns {Promise<string>}
     */
    async execute(name, args, context = {}) {
        const tool = this.#tools.get(name);
        if (!tool) {
            return `Error: Unknown tool '${name}'.`;
        }
        return await tool.execute(args, context);
    }
}

module.exports = ToolRegistry;
