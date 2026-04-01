import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { workSubmissions, campaignInfluencers, campaigns, brandProfiles, influencerProfiles, users } from '@/db/schema';
import { createNotification } from '../notifications/notifications.service';
import { sendInfluencerInvoiceOnCompletion } from '../invoice/invoice.service';
import { NotFoundError, ForbiddenError, BadRequestError } from '@/shared/errors';
import type { JWTPayload } from '@/shared/types/api';

export async function listSubmissions(campaignId: string, brandUser: JWTPayload) {
  await assertBrandOwnsCampaign(campaignId, brandUser);

  const rows = await db
    .select({
      submission: workSubmissions,
      ci: campaignInfluencers,
      influencerName: users.name,
      influencerHandle: influencerProfiles.handle,
      influencerAvatar: users.avatarUrl,
    })
    .from(workSubmissions)
    .innerJoin(campaignInfluencers, eq(campaignInfluencers.id, workSubmissions.campaignInfluencerId))
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .where(eq(campaignInfluencers.campaignId, campaignId));

  return rows.map((r) => ({
    ...r.submission,
    ci: r.ci,
    influencerName: r.influencerName,
    influencerHandle: r.influencerHandle,
    influencerAvatar: r.influencerAvatar,
  }));
}

export async function submitWork(
  campaignId: string,
  influencerUser: JWTPayload,
  dto: {
    type: string;
    url?: string;
    externalUrl?: string;
    textContent?: string;
    proofOfWorkUrl?: string;
    mediaUrl?: string;
    mediaType?: string;
    fileName?: string;
  }
) {
  if (!influencerUser.influencerId) throw new ForbiddenError('Influencer profile not found');

  const [ciData] = await db
    .select({
      ci: campaignInfluencers,
      brandUserId: brandProfiles.userId,
      campaignName: campaigns.name,
    })
    .from(campaignInfluencers)
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .innerJoin(brandProfiles, eq(brandProfiles.id, campaigns.brandId))
    .where(
      and(
        eq(campaignInfluencers.campaignId, campaignId),
        eq(campaignInfluencers.influencerId, influencerUser.influencerId)
      )
    )
    .limit(1);

  if (!ciData) throw new NotFoundError('You are not part of this campaign');
  const { ci, brandUserId, campaignName } = ciData;

  if (ci.status !== 'work_pending') {
    throw new BadRequestError(`Cannot submit work when status is '${ci.status}'`);
  }

  const existing = await db
    .select({ versionNumber: workSubmissions.versionNumber })
    .from(workSubmissions)
    .where(eq(workSubmissions.campaignInfluencerId, ci.id));
  const nextVersion = existing.length > 0 ? Math.max(...existing.map((e) => e.versionNumber)) + 1 : 1;

  const [submission] = await db
    .insert(workSubmissions)
    .values({
      campaignInfluencerId: ci.id,
      versionNumber: nextVersion,
      type: dto.type,
      url: dto.url ?? dto.externalUrl ?? null,
      externalUrl: dto.externalUrl,
      textContent: dto.textContent,
      mediaUrl: dto.mediaUrl,
      mediaType: dto.mediaType,
      fileName: dto.fileName,
      proofOfWorkUrl: dto.proofOfWorkUrl,
      status: 'pending',
    })
    .returning();

  await db
    .update(campaignInfluencers)
    .set({ status: 'work_review', updatedAt: new Date() })
    .where(eq(campaignInfluencers.id, ci.id));

  // ─── Notify the Brand ──────────────────────────────────────────────────
  await createNotification({
    userId: brandUserId,
    type: 'submission',
    title: 'Work Submitted',
    message: `Final content has been submitted for campaign "${campaignName}".`,
    campaignId: campaignId,
    campaignName: campaignName,
    actionUrl: `/campaigns/${campaignId}/submissions`,
  });

  return submission;
}

export async function approveSubmission(subId: string, brandUser: JWTPayload) {
  const [sub] = await db.select().from(workSubmissions).where(eq(workSubmissions.id, subId)).limit(1);
  if (!sub) throw new NotFoundError('Submission');

  const [ciData] = await db
    .select({
      ci: campaignInfluencers,
      influencerUserId: influencerProfiles.userId,
      campaignName: campaigns.name,
      budgetMode: campaigns.budgetMode,
    })
    .from(campaignInfluencers)
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .where(eq(campaignInfluencers.id, sub.campaignInfluencerId))
    .limit(1);

  if (!ciData) throw new NotFoundError('Campaign influencer');
  const { ci, influencerUserId, campaignName, budgetMode } = ciData;

  await assertBrandOwnsCampaign(ci.campaignId, brandUser);

  const [updated] = await db
    .update(workSubmissions)
    .set({ status: 'approved', reviewedAt: new Date(), reviewedBy: brandUser.sub })
    .where(eq(workSubmissions.id, subId))
    .returning();

  if (budgetMode === 'product') {
    await db
      .update(campaignInfluencers)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(campaignInfluencers.id, ci.id));
    // Product campaigns have no final payment — send influencer invoice now
    sendInfluencerInvoiceOnCompletion(ci.id).catch(() => {});
  }

  let notifMessage: string;
  if (budgetMode === 'product') {
    notifMessage = `Your final content for "${campaignName}" has been approved! Campaign completed.`;
  } else {
    notifMessage = `Your final content for "${campaignName}" has been approved! Final payment will be processed shortly.`;
  }

  await createNotification({
    userId: influencerUserId,
    type: 'submission',
    title: 'Work Approved',
    message: notifMessage,
    campaignId: ci.campaignId,
    campaignName: campaignName,
    actionUrl: `/campaigns/${ci.campaignId}`,
  });

  return updated;
}

export async function rejectSubmission(subId: string, reviewNote: string, brandUser: JWTPayload) {
  const [sub] = await db.select().from(workSubmissions).where(eq(workSubmissions.id, subId)).limit(1);
  if (!sub) throw new NotFoundError('Submission');

  const [ciData] = await db
    .select({
      ci: campaignInfluencers,
      influencerUserId: influencerProfiles.userId,
      campaignName: campaigns.name,
    })
    .from(campaignInfluencers)
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .where(eq(campaignInfluencers.id, sub.campaignInfluencerId))
    .limit(1);

  if (!ciData) throw new NotFoundError('Campaign influencer');
  const { ci, influencerUserId, campaignName } = ciData;

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

  // ─── Notify the Influencer ───────────────────────────────────────────────
  await createNotification({
    userId: influencerUserId,
    type: 'submission',
    title: 'Work Rejected',
    message: `The brand has requested changes to your content for "${campaignName}".`,
    campaignId: ci.campaignId,
    campaignName: campaignName,
    actionUrl: `/campaigns/${ci.campaignId}`,
  });

  return updated;
}

export async function getMySubmissions(campaignId: string, influencerUser: JWTPayload) {
  if (!influencerUser.influencerId) throw new ForbiddenError('Influencer profile not found');

  const [ci] = await db
    .select({ id: campaignInfluencers.id })
    .from(campaignInfluencers)
    .where(
      and(
        eq(campaignInfluencers.campaignId, campaignId),
        eq(campaignInfluencers.influencerId, influencerUser.influencerId)
      )
    )
    .limit(1);

  if (!ci) return [];

  const rows = await db
    .select()
    .from(workSubmissions)
    .where(eq(workSubmissions.campaignInfluencerId, ci.id));

  return rows;
}

async function assertBrandOwnsCampaign(campaignId: string, user: JWTPayload) {
  if (user.role === 'admin') return;
  const [campaign] = await db.select({ brandId: campaigns.brandId }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign) throw new NotFoundError('Campaign');
  if (campaign.brandId !== user.brandId) throw new ForbiddenError('You do not own this campaign');
}
