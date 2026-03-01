import { getAIProvider } from './providers';
import type { AIMessage } from './providers/types';
import type { Response } from 'express';
import { getCampaignById } from '@/modules/campaigns/campaigns.service';
import { db } from '@/db';
import { influencerProfiles } from '@/db/schema';
import { inArray } from 'drizzle-orm';

const STRATEGIST_SYSTEM_PROMPT = `You are Mutiny AI Strategist, an expert influencer
marketing advisor for brands using the Mutiny Maker platform. You help brands:
- Define campaign objectives and strategy
- Choose the right creator tiers and budget allocation
- Craft compelling campaign briefs
- Analyze campaign performance and suggest optimizations
- Negotiate and communicate with influencers

Brand: {brandName}
Campaign Data: {campaignData}
`;

export async function streamStrategistResponse(
    messages: AIMessage[],
    campaignId: string | undefined,
    res: Response
) {
    const provider = getAIProvider();
    let campaignData = 'No active campaign context provided';

    if (campaignId) {
        const campaign = await getCampaignById(campaignId, { role: 'admin' } as any);
        campaignData = JSON.stringify({
            name: campaign.name,
            objective: campaign.objective,
            budget: campaign.budgetMode,
            niches: campaign.niches,
        }, null, 2);
    }

    const systemPrompt = STRATEGIST_SYSTEM_PROMPT
        .replace('{brandName}', 'Mutiny Brand') // This can be replaced with real context if available
        .replace('{campaignData}', campaignData);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await provider.streamChat(messages, systemPrompt, res);
}

export async function smartSelectInfluencers(
    campaignId: string,
    candidateInfluencerIds: string[]
) {
    const campaign = await getCampaignById(campaignId, { role: 'admin' } as any);
    const provider = getAIProvider();

    // Fetch candidates
    const candidates = await db.query.influencerProfiles.findMany({
        where: candidateInfluencerIds.length > 0 ? inArray(influencerProfiles.id, candidateInfluencerIds) : undefined,
        limit: 50, // To avoid passing too immense context
    });

    const prompt = buildSmartSelectPrompt(campaign, candidates);
    const raw = await provider.complete(prompt);

    // Parse structured JSON response from AI
    try {
        return JSON.parse(raw);
    } catch (e) {
        // Attempt to extract JSON from markdown formatting if any
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
            return JSON.parse(match[0]);
        }
        return [];
    }
}

function buildSmartSelectPrompt(campaign: any, influencers: any[]) {
    return `
You are an influencer selection expert. Given this campaign and list of influencers,
rank the top 10 best matches and explain why.

Campaign:
- Name: ${campaign.name}
- Niche: ${campaign.niches.join(', ')}
- Budget mode: ${campaign.budgetMode}
- Creator sizes wanted: ${campaign.creatorSizes.join(', ')}
- Objective: ${campaign.objective}

Influencers (JSON array):
${JSON.stringify(influencers.slice(0, 50))}

Respond with a JSON array ONLY:
[{ "influencerId": "...", "score": 85, "reason": "..." }]

Only respond with JSON, no other text.`;
}
