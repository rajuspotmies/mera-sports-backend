export interface AIMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface AIProvider {
    streamChat(messages: AIMessage[], systemPrompt: string, res: any): Promise<void>;
    complete(prompt: string): Promise<string>;
}
