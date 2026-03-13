import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import { env } from '@/config/env';
import type { AIMessage, AIProvider } from './types';
import type { Response } from 'express';

export class AzureProvider implements AIProvider {
    private client: OpenAIClient;

    constructor() {
        if (!env.AZURE_OPENAI_API_KEY || !env.AZURE_OPENAI_ENDPOINT) {
            throw new Error('Azure OpenAI credentials are not configured');
        }
        this.client = new OpenAIClient(
            env.AZURE_OPENAI_ENDPOINT,
            new AzureKeyCredential(env.AZURE_OPENAI_API_KEY)
        );
    }

    async streamChat(messages: AIMessage[], systemPrompt: string, res: Response) {
        const deploymentId = env.AZURE_OPENAI_DEPLOYMENT!;
        const formattedMessages = [
            { role: 'system' as const, content: systemPrompt },
            ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        ];

        const events = await this.client.listChatCompletions(deploymentId, formattedMessages, {
            maxTokens: 2000,
        });

        for await (const event of events) {
            for (const choice of event.choices) {
                const content = choice.delta?.content || '';
                if (content) {
                    res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
            }
        }
        res.write('data: [DONE]\n\n');
        res.end();
    }

    async complete(prompt: string): Promise<string> {
        const deploymentId = env.AZURE_OPENAI_DEPLOYMENT!;
        const result = await this.client.getChatCompletions(deploymentId, [
            { role: 'user', content: prompt }
        ]);
        return result.choices[0]?.message?.content ?? '';
    }
}
