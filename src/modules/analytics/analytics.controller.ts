import type { Request, Response } from 'express';
import { sendSuccess } from '@/shared/utils/response';
import { db } from '@/db';
import { campaigns, campaignInfluencers, analyticsSnapshots } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function overviewHandler(req: Request, res: Response): Promise<void> {
  if (!req.user.brandId) {
    sendSuccess(res, { totalCampaigns: 0, totalInfluencers: 0, totalReach: 0, totalSpend: 0 });
    return;
  }

  const [stats] = await db
    .select({
      totalCampaigns: sql<number>`count(distinct ${campaigns.id})::int`,
      totalInfluencers: sql<number>`count(distinct ${campaignInfluencers.id})::int`,
    })
    .from(campaigns)
    .leftJoin(campaignInfluencers, eq(campaignInfluencers.campaignId, campaigns.id))
    .where(eq(campaigns.brandId, req.user.brandId));

  sendSuccess(res, {
    totalCampaigns: stats.totalCampaigns ?? 0,
    totalInfluencers: stats.totalInfluencers ?? 0,
    // TODO: aggregate from analytics_snapshots once data exists
    totalReach: 0,
    totalSpend: 0,
  });
}

export async function campaignAnalyticsHandler(req: Request, res: Response): Promise<void> {
  const snapshots = await db
    .select()
    .from(analyticsSnapshots)
    .where(eq(analyticsSnapshots.campaignId, req.params.campaignId))
    .orderBy(analyticsSnapshots.snapshotDate);

  sendSuccess(res, snapshots);
}

export async function contentAnalyticsHandler(_req: Request, res: Response): Promise<void> {
  // TODO: implement content performance breakdown
  sendSuccess(res, { message: 'Analytics coming soon' });
}
