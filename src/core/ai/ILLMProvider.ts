export interface ChatStreamParams {
    model: string;
    messages: any[];
    tools?: any[];
    tool_choice?: any;
    options?: Record<string, any>;
    think?: boolean;
}

export interface ChatStreamChunk {
    content?: string;
    thinking?: string;
    toolCalls?: any[] | null;
}

/**
 * ILLMProvider — Abstract Strategy Interface for Large Language Model Providers.
 * Adheres to Open/Closed Principle (OCP) and Dependency Inversion Principle (DIP).
 */
class ILLMProvider {
    /**
     * Generate chat completion stream from LLM vendor.
     */
    // eslint-disable-next-line require-yield
    async *chatStream(_params: ChatStreamParams): AsyncGenerator<ChatStreamChunk> {
        throw new Error('Method ILLMProvider.chatStream() must be implemented.');
    }

    /**
     * Check whether provider is initialized and ready.
     */
    get ready(): boolean {
        return false;
    }
}

export default ILLMProvider;
