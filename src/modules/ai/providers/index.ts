import { OpenAIProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';
import type { AIProvider } from './types';
import { env } from '@/config/env';

export function getAIProvider(): AIProvider {
    switch (env.AI_PROVIDER) {
        case 'anthropic': return new AnthropicProvider();
        case 'openai':
        default: return new OpenAIProvider();
    }
}
