/**
 * BaseTool — Abstract Base Strategy for AI Functions.
 * Follows Strategy Pattern & Open-Closed Principle (OCP).
 */
class BaseTool {
    /**
     * Tool definition object for Ollama / OpenAI API tools schema.
     * @returns {Object}
     */
    get definition() {
        throw new Error('[BaseTool] definition must be implemented by subclass.');
    }

    /**
     * Execute the tool with given arguments.
     * @param {Object} args - Arguments passed by LLM function call
     * @param {Object} context - Execution context (e.g. client, channel)
     * @returns {Promise<string>} Output string to return to LLM
     */
    async execute(args, context = {}) {
        throw new Error('[BaseTool] execute() must be implemented by subclass.');
    }
}

module.exports = BaseTool;
