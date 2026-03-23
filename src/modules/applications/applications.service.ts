import { eq, and, sql, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  campaignInfluencers,
  campaigns,
  influencerProfiles,
  users,
  brandProfiles,
} from '@/db/schema';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from '@/shared/errors';
import { parsePagination, buildPaginationMeta, getOffset } from '@/shared/utils/pagination';
import type { JWTPayload } from '@/shared/types/api';
import type { ApplyToCampaignDTO, ListApplicationsQuery } from './applications.schema';

import { createNotification } from '../notifications/notifications.service';

// ─── List applications for a campaign (brand side) ───────────────────────────

export async function listApplications(
  campaignId: string,
  brandUser: JWTPayload,
  query: ListApplicationsQuery
) {
  // Verify ownership
  await assertBrandOwnsCampaign(campaignId, brandUser);

  const { page, limit } = parsePagination(query);
  const offset = getOffset({ page, limit });

  const conditions: any[] = [eq(campaignInfluencers.campaignId, campaignId)];
  if (query.status) {
    conditions.push(eq(campaignInfluencers.status, query.status));
  } else {
    // Only return applications/invites that have not progressed solidly into execution
    const earlyStatuses = ['invited', 'applied', 'negotiating', 'accepted', 'rejected', 'withdrawn'];
    conditions.push(inArray(campaignInfluencers.status, earlyStatuses as any));
  }

  const where = and(...conditions);

  const rows = await db
    .select({
      id: campaignInfluencers.id,
      influencerId: campaignInfluencers.influencerId,
      origin: campaignInfluencers.origin,
      status: campaignInfluencers.status,
      chatEnabled: campaignInfluencers.chatEnabled,
      tierRate: campaignInfluencers.tierRate,
      agreedBudget: campaignInfluencers.agreedBudget,
      applicationNote: campaignInfluencers.applicationNote,
      appliedAt: campaignInfluencers.appliedAt,
      acceptedAt: campaignInfluencers.acceptedAt,
      createdAt: campaignInfluencers.createdAt,
      // Influencer info
      handle: influencerProfiles.handle,
      bio: influencerProfiles.bio,
      tier: influencerProfiles.tier,
      followerCount: influencerProfiles.followerCount,
      engagementRate: influencerProfiles.engagementRate,
      niches: influencerProfiles.niches,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
    })
    .from(campaignInfluencers)
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .where(where)
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaignInfluencers)
    .where(where);

  return { applications: rows, meta: buildPaginationMeta(count, { page, limit }) };
}

// ─── Status Board (brand side) ────────────────────────────────────────────────

export async function getStatusBoard(
  campaignId: string,
  brandUser: JWTPayload,
  query: ListApplicationsQuery
) {
  // Verify ownership
  await assertBrandOwnsCampaign(campaignId, brandUser);

  const { page, limit } = parsePagination(query);
  const offset = getOffset({ page, limit });

  // No default status filter for the status board (show everything)
  const conditions: any[] = [eq(campaignInfluencers.campaignId, campaignId)];
  if (query.status) {
    conditions.push(eq(campaignInfluencers.status, query.status));
  }

  const where = and(...conditions);

  const rows = await db
    .select({
      id: campaignInfluencers.id,
      influencerId: campaignInfluencers.influencerId,
      origin: campaignInfluencers.origin,
      status: campaignInfluencers.status,
      chatEnabled: campaignInfluencers.chatEnabled,
      tierRate: campaignInfluencers.tierRate,
      agreedBudget: campaignInfluencers.agreedBudget,
      applicationNote: campaignInfluencers.applicationNote,
      appliedAt: campaignInfluencers.appliedAt,
      acceptedAt: campaignInfluencers.acceptedAt,
      paidAt: campaignInfluencers.paidAt,
      finalPaidAt: campaignInfluencers.finalPaidAt,
      completedAt: campaignInfluencers.completedAt,
      createdAt: campaignInfluencers.createdAt,
      // Influencer info
      handle: influencerProfiles.handle,
      bio: influencerProfiles.bio,
      tier: influencerProfiles.tier,
      followerCount: influencerProfiles.followerCount,
      engagementRate: influencerProfiles.engagementRate,
      niches: influencerProfiles.niches,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
    })
    .from(campaignInfluencers)
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .where(where)
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaignInfluencers)
    .where(where);

  return { applications: rows, meta: buildPaginationMeta(count, { page, limit }) };
}

// ─── Apply to campaign (influencer side) ─────────────────────────────────────

export async function applyToCampaign(
  campaignId: string,
  influencerUser: JWTPayload,
  dto: ApplyToCampaignDTO
) {
  if (!influencerUser.influencerId) throw new ForbiddenError('Influencer profile not found');

  const [campaignData] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      visibility: campaigns.visibility,
      status: campaigns.status,
      applicationDeadline: campaigns.applicationDeadline,
      workDeadline: campaigns.workDeadline,
      budgetTierPricing: campaigns.budgetTierPricing,
      brandUserId: brandProfiles.userId,
    })
    .from(campaigns)
    .innerJoin(brandProfiles, eq(campaigns.brandId, brandProfiles.id))
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaignData) throw new NotFoundError('Campaign');
  if (campaignData.visibility !== 'public') throw new ForbiddenError('This campaign is not open for applications');
  if (campaignData.status !== 'active') throw new BadRequestError('Campaign is not currently accepting applications');

  const now = new Date();
  if (campaignData.applicationDeadline && campaignData.applicationDeadline < now) {
    throw new BadRequestError('Application deadline has passed');
  }
  if (campaignData.workDeadline && campaignData.workDeadline < now) {
    throw new BadRequestError('Work deadline has passed');
  }

  // Check for duplicate
  const [existing] = await db
    .select({ id: campaignInfluencers.id, status: campaignInfluencers.status })
    .from(campaignInfluencers)
    .where(
      and(
        eq(campaignInfluencers.campaignId, campaignId),
        eq(campaignInfluencers.influencerId, influencerUser.influencerId)
      )
    )
    .limit(1);

  if (existing) {
    if (existing.status === 'withdrawn' || existing.status === 'rejected') {
      throw new ConflictError('You have already withdrawn or been rejected from this campaign');
    }
    throw new ConflictError('You have already applied to this campaign');
  }

  // Resolve tier_rate: for public single-tier with quote, use provided amount; else from campaign pricing
  const tierPricing = (campaignData.budgetTierPricing || []) as Array<{ tier: string; rate: number }>;
  const isSingleTier = tierPricing.length === 1;
  const quotedAmount = dto.amount ?? dto.proposedBudget;

  let tierRate: string | null;
  if (isSingleTier && quotedAmount != null && quotedAmount > 0) {
    tierRate = quotedAmount.toString();
  } else {
    const [influencer] = await db
      .select({ tier: influencerProfiles.tier })
      .from(influencerProfiles)
      .where(eq(influencerProfiles.id, influencerUser.influencerId))
      .limit(1);
    const tierEntry = tierPricing.find((t) => t.tier === influencer?.tier);
    tierRate = tierEntry ? tierEntry.rate.toString() : null;
  }

  const [ci] = await db
    .insert(campaignInfluencers)
    .values({
      campaignId,
      influencerId: influencerUser.influencerId,
      origin: 'influencer_application',
      status: 'applied',
      tierRate,
      applicationNote: dto.note,
      appliedAt: new Date(),
    })
    .returning();

  // Increment applications counter
  await db
    .update(campaigns)
    .set({
      applicationsCount: sql`${campaigns.applicationsCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));

  // ─── Notify the Brand ──────────────────────────────────────────────────
  await createNotification({
    userId: campaignData.brandUserId,
    type: 'application',
    title: 'New Campaign Application',
    message: `A new influencer has applied to your campaign "${campaignData.name}".`,
    campaignId: campaignId,
    campaignName: campaignData.name,
    actionUrl: `/campaigns/${campaignId}/applications`,
  });

  return ci;
}

// ─── Influencer accepts a brand invite ────────────────────────────────────────

export async function acceptInvite(
  campaignId: string,
  influencerUser: JWTPayload
) {
  if (!influencerUser.influencerId) throw new ForbiddenError('Influencer profile not found');

  const ci = await getCIOrThrow(campaignId, influencerUser.influencerId);

  if (ci.status !== 'invited') {
    throw new BadRequestError(`Cannot accept invite when status is '${ci.status}'`);
  }

  // Accept at tier_rate — move to accepted (chat starts later at script/work stage)
  const [updated] = await db
    .update(campaignInfluencers)
    .set({
      status: 'accepted',
      agreedBudget: ci.tierRate,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(campaignInfluencers.id, ci.id))
    .returning();

  // Increment creatorsAccepted
  const [campaign] = await db
    .update(campaigns)
    .set({ creatorsAccepted: sql`${campaigns.creatorsAccepted} + 1`, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId))
    .returning();

  // ─── Notify the Brand ──────────────────────────────────────────────────
  const [brand] = await db.select({ userId: brandProfiles.userId }).from(brandProfiles).where(eq(brandProfiles.id, campaign.brandId)).limit(1);
  if (brand) {
    await createNotification({
      userId: brand.userId,
      type: 'application',
      title: 'Invite Accepted',
      message: `An influencer has accepted your invite to "${campaign.name}".`,
      campaignId: campaignId,
      campaignName: campaign.name,
      actionUrl: `/campaigns/${campaignId}/applications`,
    });
  }

  return updated;
}

// ─── Influencer declines/withdraws from a brand invite ───────────────────────

export async function declineInvite(campaignId: string, influencerUser: JWTPayload) {
  if (!influencerUser.influencerId) throw new ForbiddenError('Influencer profile not found');

  const ci = await getCIOrThrow(campaignId, influencerUser.influencerId);

  if (!['invited', 'applied', 'negotiating'].includes(ci.status)) {
    throw new BadRequestError(`Cannot withdraw from status '${ci.status}'`);
  }

  const [updated] = await db
    .update(campaignInfluencers)
    .set({ status: 'withdrawn', updatedAt: new Date() })
    .where(eq(campaignInfluencers.id, ci.id))
    .returning();

  return updated;
}

// ─── Brand approves an application (applied → accepted) ──────────────────────

export async function approveApplication(
  campaignId: string,
  appId: string,
  brandUser: JWTPayload
) {
  await assertBrandOwnsCampaign(campaignId, brandUser);

  const [ciData] = await db
    .select({
      ci: campaignInfluencers,
      influencerUserId: influencerProfiles.userId,
      campaignName: campaigns.name,
    })
    .from(campaignInfluencers)
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .where(and(eq(campaignInfluencers.id, appId), eq(campaignInfluencers.campaignId, campaignId)))
    .limit(1);

  if (!ciData) throw new NotFoundError('Application');
  const { ci, influencerUserId, campaignName } = ciData;

  if (!['applied', 'negotiating'].includes(ci.status)) {
    throw new BadRequestError(`Cannot approve application with status '${ci.status}'`);
  }

  const [updated] = await db
    .update(campaignInfluencers)
    .set({
      status: 'accepted',
      agreedBudget: ci.tierRate,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(campaignInfluencers.id, appId))
    .returning();

  // Increment creatorsAccepted
  await db
    .update(campaigns)
    .set({ creatorsAccepted: sql`${campaigns.creatorsAccepted} + 1`, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  // ─── Notify the Influencer ───────────────────────────────────────────────
  await createNotification({
    userId: influencerUserId,
    type: 'application',
    title: 'Application Approved!',
    message: `Your application to "${campaignName}" has been approved. Chat opens once you reach the script or work stage.`,
    campaignId: campaignId,
    campaignName: campaignName,
    actionUrl: `/campaigns/${campaignId}`,
  });

  return updated;
}

// ─── Brand rejects an application ────────────────────────────────────────────

export async function rejectApplication(
  campaignId: string,
  appId: string,
  brandUser: JWTPayload
) {
  await assertBrandOwnsCampaign(campaignId, brandUser);

  const [ciData] = await db
    .select({
      ci: campaignInfluencers,
      influencerUserId: influencerProfiles.userId,
      campaignName: campaigns.name,
    })
    .from(campaignInfluencers)
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .where(and(eq(campaignInfluencers.id, appId), eq(campaignInfluencers.campaignId, campaignId)))
    .limit(1);

  if (!ciData) throw new NotFoundError('Application');
  const { ci, influencerUserId, campaignName } = ciData;

  if (!['applied', 'invited', 'negotiating'].includes(ci.status)) {
    throw new BadRequestError(`Cannot reject application with status '${ci.status}'`);
  }

  const [updated] = await db
    .update(campaignInfluencers)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(eq(campaignInfluencers.id, appId))
    .returning();

  // ─── Notify the Influencer ───────────────────────────────────────────────
  await createNotification({
    userId: influencerUserId,
    type: 'application',
    title: 'Application Update',
    message: `Your application to "${campaignName}" was not accepted this time.`,
    campaignId: campaignId,
    campaignName: campaignName,
    actionUrl: `/campaigns/${campaignId}`,
  });

  return updated;
}

// ─── Influencer gets their own applications ───────────────────────────────────

export async function getMyApplications(influencerUser: JWTPayload, query: ListApplicationsQuery) {
  if (!influencerUser.influencerId) throw new ForbiddenError('Influencer profile not found');

  const { page, limit } = parsePagination(query);
  const offset = getOffset({ page, limit });

  const conditions = [eq(campaignInfluencers.influencerId, influencerUser.influencerId)];
  if (query.status) conditions.push(eq(campaignInfluencers.status, query.status));

  const where = and(...conditions);

  const rows = await db
    .select({
      id: campaignInfluencers.id,
      campaignId: campaignInfluencers.campaignId,
      origin: campaignInfluencers.origin,
      status: campaignInfluencers.status,
      chatEnabled: campaignInfluencers.chatEnabled,
      tierRate: campaignInfluencers.tierRate,
      agreedBudget: campaignInfluencers.agreedBudget,
      applicationNote: campaignInfluencers.applicationNote,
      appliedAt: campaignInfluencers.appliedAt,
      acceptedAt: campaignInfluencers.acceptedAt,
      paidAt: campaignInfluencers.paidAt,
      finalPaidAt: campaignInfluencers.finalPaidAt,
      productShippedAt: campaignInfluencers.productShippedAt,
      productReceivedAt: campaignInfluencers.productReceivedAt,
      completedAt: campaignInfluencers.completedAt,
      settledAt: campaignInfluencers.settledAt,
      createdAt: campaignInfluencers.createdAt,
      // Campaign info
      campaignName: campaigns.name,
      campaignType: campaigns.type,
      campaignStatus: campaigns.status,
      campaignThumbnail: campaigns.thumbnailUrl,
      budgetMode: campaigns.budgetMode,
      scriptType: campaigns.scriptType,
    })
    .from(campaignInfluencers)
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .where(where)
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaignInfluencers)
    .where(where);

  return { applications: rows, meta: buildPaginationMeta(count, { page, limit }) };
}

// ─── Product tracking ────────────────────────────────────────────────────────

export async function markProductShipped(
  campaignId: string,
  appId: string,
  brandUser: JWTPayload
) {
  await assertBrandOwnsCampaign(campaignId, brandUser);

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
    .where(and(eq(campaignInfluencers.id, appId), eq(campaignInfluencers.campaignId, campaignId)))
    .limit(1);

  if (!ciData) throw new NotFoundError('Application');
  const { ci, influencerUserId, campaignName, budgetMode } = ciData;

  if (budgetMode !== 'product' && budgetMode !== 'paid_product') {
    throw new BadRequestError('This campaign does not involve a product');
  }

  const [updated] = await db
    .update(campaignInfluencers)
    .set({ productShippedAt: new Date(), updatedAt: new Date() })
    .where(eq(campaignInfluencers.id, appId))
    .returning();

  await createNotification({
    userId: influencerUserId,
    type: 'system',
    title: 'Product Shipped',
    message: `The product for "${campaignName}" has been shipped to you!`,
    campaignId,
    campaignName,
    actionUrl: `/campaigns/${campaignId}`,
  });

  return updated;
}

export async function confirmProductReceived(
  campaignId: string,
  influencerUser: JWTPayload
) {
  if (!influencerUser.influencerId) throw new ForbiddenError('Influencer profile not found');

  const [ciData] = await db
    .select({
      ci: campaignInfluencers,
      campaignName: campaigns.name,
      budgetMode: campaigns.budgetMode,
      brandUserId: brandProfiles.userId,
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

  if (!ciData) throw new NotFoundError('Application');
  const { ci, campaignName, budgetMode, brandUserId } = ciData;

  if (budgetMode !== 'product' && budgetMode !== 'paid_product') {
    throw new BadRequestError('This campaign does not involve a product');
  }

  const [updated] = await db
    .update(campaignInfluencers)
    .set({ productReceivedAt: new Date(), updatedAt: new Date() })
    .where(eq(campaignInfluencers.id, ci.id))
    .returning();

  await createNotification({
    userId: brandUserId,
    type: 'system',
    title: 'Product Received',
    message: `The influencer has confirmed receiving the product for "${campaignName}".`,
    campaignId,
    campaignName,
    actionUrl: `/campaigns/${campaignId}/applications`,
  });

  return updated;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertBrandOwnsCampaign(campaignId: string, user: JWTPayload) {
  const [campaign] = await db
    .select({ id: campaigns.id, brandId: campaigns.brandId })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) throw new NotFoundError('Campaign');
  if (user.role !== 'admin' && campaign.brandId !== user.brandId) {
    throw new ForbiddenError('You do not own this campaign');
  }
  return campaign;
}

async function getCIOrThrow(campaignId: string, influencerId: string) {
  const [ci] = await db
    .select()
    .from(campaignInfluencers)
    .where(
      and(
        eq(campaignInfluencers.campaignId, campaignId),
        eq(campaignInfluencers.influencerId, influencerId)
      )
    )
    .limit(1);

  if (!ci) throw new NotFoundError('Application / invite not found');
  return ci;
}

