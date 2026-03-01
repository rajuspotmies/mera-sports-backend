import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/config/env';
import type { AIMessage, AIProvider } from './types';
import type { Response } from 'express';

export class AnthropicProvider implements AIProvider {
    private client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    async streamChat(messages: AIMessage[], systemPrompt: string, res: Response) {
        const stream = await this.client.messages.stream({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 2048,
            system: systemPrompt,
            messages: messages as any[],
        });
        for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                res.write(`data: ${JSON.stringify({ content: chunk.delta.text })}\n\n`);
            }
        }
        res.write('data: [DONE]\n\n');
        res.end();
    }

    async complete(prompt: string): Promise<string> {
        const res = await this.client.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
        });
        return res.content[0].type === 'text' ? (res.content[0] as any).text : '';
    }
}
