import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { workSubmissions, campaignInfluencers, campaigns } from '@/db/schema';
import { NotFoundError, ForbiddenError, BadRequestError } from '@/shared/errors';
import type { JWTPayload } from '@/shared/types/api';

export async function listSubmissions(campaignId: string, brandUser: JWTPayload) {
  await assertBrandOwnsCampaign(campaignId, brandUser);

  const rows = await db
    .select()
    .from(workSubmissions)
    .innerJoin(campaignInfluencers, eq(campaignInfluencers.id, workSubmissions.campaignInfluencerId))
    .where(eq(campaignInfluencers.campaignId, campaignId));

  return rows.map((r) => ({ ...r.work_submissions, ci: r.campaign_influencers }));
}

export async function submitWork(
  campaignId: string,
  influencerUser: JWTPayload,
  dto: { type: string; url: string; proofOfWorkUrl?: string }
) {
  if (!influencerUser.influencerId) throw new ForbiddenError('Influencer profile not found');

  const [ci] = await db
    .select()
    .from(campaignInfluencers)
    .where(
      and(
        eq(campaignInfluencers.campaignId, campaignId),
        eq(campaignInfluencers.influencerId, influencerUser.influencerId)
      )
    )
    .limit(1);

  if (!ci) throw new NotFoundError('You are not part of this campaign');
  if (ci.status !== 'work_pending') {
    throw new BadRequestError(`Cannot submit work when status is '${ci.status}'`);
  }

  const [submission] = await db
    .insert(workSubmissions)
    .values({
      campaignInfluencerId: ci.id,
      type: dto.type,
      url: dto.url,
      proofOfWorkUrl: dto.proofOfWorkUrl,
      status: 'pending',
    })
    .returning();

  await db
    .update(campaignInfluencers)
    .set({ status: 'work_review', updatedAt: new Date() })
    .where(eq(campaignInfluencers.id, ci.id));

  return submission;
}

export async function approveSubmission(subId: string, brandUser: JWTPayload) {
  const [sub] = await db.select().from(workSubmissions).where(eq(workSubmissions.id, subId)).limit(1);
  if (!sub) throw new NotFoundError('Submission');

  const [ci] = await db.select().from(campaignInfluencers).where(eq(campaignInfluencers.id, sub.campaignInfluencerId)).limit(1);
  if (!ci) throw new NotFoundError('Campaign influencer');

  await assertBrandOwnsCampaign(ci.campaignId, brandUser);

  const [updated] = await db
    .update(workSubmissions)
    .set({ status: 'approved', reviewedAt: new Date(), reviewedBy: brandUser.sub })
    .where(eq(workSubmissions.id, subId))
    .returning();

  await db
    .update(campaignInfluencers)
    .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(campaignInfluencers.id, ci.id));

  return updated;
}

export async function rejectSubmission(subId: string, reviewNote: string, brandUser: JWTPayload) {
  const [sub] = await db.select().from(workSubmissions).where(eq(workSubmissions.id, subId)).limit(1);
  if (!sub) throw new NotFoundError('Submission');

  const [ci] = await db.select().from(campaignInfluencers).where(eq(campaignInfluencers.id, sub.campaignInfluencerId)).limit(1);
  if (!ci) throw new NotFoundError('Campaign influencer');

  await assertBrandOwnsCampaign(ci.campaignId, brandUser);

  const [updated] = await db
    .update(workSubmissions)
    .set({ status: 'rejected', reviewNote, reviewedAt: new Date(), reviewedBy: brandUser.sub })
    .where(eq(workSubmissions.id, subId))
    .returning();

  // Reset to work_pending for resubmission
  await db
    .update(campaignInfluencers)
    .set({ status: 'work_pending', updatedAt: new Date() })
    .where(eq(campaignInfluencers.id, ci.id));

  return updated;
}

async function assertBrandOwnsCampaign(campaignId: string, user: JWTPayload) {
  if (user.role === 'admin') return;
  const [campaign] = await db.select({ brandId: campaigns.brandId }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign) throw new NotFoundError('Campaign');
  if (campaign.brandId !== user.brandId) throw new ForbiddenError('You do not own this campaign');
}
