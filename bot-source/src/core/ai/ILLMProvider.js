/**
 * ILLMProvider — Abstract Strategy Interface for Large Language Model Providers.
 * Adheres to Open/Closed Principle (OCP) and Dependency Inversion Principle (DIP).
 */
class ILLMProvider {
    /**
     * Generate chat completion stream from LLM vendor.
     * @param {Object} params
     * @param {string} params.model - Model identifier
     * @param {Array<Object>} params.messages - Conversational message history
     * @param {Array<Object>} [params.tools] - Available tool definitions
     * @returns {AsyncGenerator<{content?: string, toolCalls?: Array}>}
     */
    async *chatStream({ model, messages, tools }) {
        throw new Error('Method ILLMProvider.chatStream() must be implemented.');
    }

    /**
     * Check whether provider is initialized and ready.
     * @returns {boolean}
     */
    get ready() {
        return false;
    }
}

module.exports = ILLMProvider;
