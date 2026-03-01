import OpenAI from 'openai';
import { env } from '@/config/env';
import type { AIMessage, AIProvider } from './types';
import type { Response } from 'express';

export class OpenAIProvider implements AIProvider {
    private client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    async streamChat(messages: AIMessage[], systemPrompt: string, res: Response) {
        const stream = await this.client.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            stream: true,
        });
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
    }

    async complete(prompt: string): Promise<string> {
        const res = await this.client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
        });
        return res.choices[0].message.content ?? '';
    }
}
