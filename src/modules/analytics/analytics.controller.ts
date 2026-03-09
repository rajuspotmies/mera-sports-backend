import type { Request, Response } from 'express';
import { sendSuccess } from '@/shared/utils/response';
import * as analyticsService from './analytics.service';

export async function overviewHandler(req: Request, res: Response): Promise<void> {
  const brandId = req.user.brandId;
  const influencerId = req.user.influencerId;

  if (brandId) {
    const stats = await analyticsService.getBrandOverview(brandId);
    sendSuccess(res, stats);
    return;
  }

  if (influencerId) {
    const stats = await analyticsService.getInfluencerStats(influencerId);
    sendSuccess(res, stats);
    return;
  }

  sendSuccess(res, { message: 'No profile found for analytics' });
}

export async function campaignAnalyticsHandler(req: Request, res: Response): Promise<void> {
  const { campaignId } = req.params;
  const snapshots = await analyticsService.getCampaignPerformance(campaignId);
  sendSuccess(res, snapshots);
}

export async function contentAnalyticsHandler(_req: Request, res: Response): Promise<void> {
  // TODO: implement content performance breakdown
  sendSuccess(res, { message: 'Content analytics coming soon' });
}
