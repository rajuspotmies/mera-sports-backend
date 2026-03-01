import type { Request, Response, NextFunction } from 'express';
import { db } from '@/db';
import { campaigns } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NotFoundError, ForbiddenError } from '@/shared/errors';

/**
 * Verifies that the authenticated brand_owner owns the requested campaign.
 * Attaches campaign to req.campaign for downstream use.
 *
 * Requires :campaignId in route params and authenticate middleware to have run first.
 */
export async function requireCampaignOwnership(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const { campaignId } = req.params;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) throw new NotFoundError('Campaign');

  // Admin can access any campaign
  if (req.user.role === 'admin') {
    req.campaign = campaign;
    return next();
  }

  if (campaign.brandId !== req.user.brandId) {
    throw new ForbiddenError('You do not own this campaign');
  }

  req.campaign = campaign;
  next();
}
