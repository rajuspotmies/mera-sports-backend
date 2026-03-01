import { Request, Response } from 'express';
import * as aiService from './ai.service';
import { AppError } from '@/shared/errors/AppError';

export async function strategistHandler(req: Request, res: Response) {
    const { messages, campaignId } = req.body;

    if (!messages || !Array.isArray(messages)) {
        throw new AppError('INVALID_INPUT', 'Messages array is required');
    }

    // Set timeout long enough for SSE streams
    req.setTimeout(0);

    try {
        await aiService.streamStrategistResponse(messages, campaignId, res);
    } catch (error: any) {
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: { code: 'AI_ERROR', message: error.message } });
        } else {
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        }
    }
}

export async function smartSelectHandler(req: Request, res: Response) {
    const { campaignId, candidateInfluencerIds = [] } = req.body;

    if (!campaignId) {
        throw new AppError('INVALID_INPUT', 'campaignId is required');
    }

    const results = await aiService.smartSelectInfluencers(campaignId, candidateInfluencerIds);

    res.json({
        success: true,
        data: results,
    });
}
