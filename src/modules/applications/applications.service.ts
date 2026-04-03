import { eq, and, sql, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  campaignInfluencers,
  campaigns,
  influencerProfiles,
  users,
  brandProfiles,
  bankDetails,
  influencerPortfolios,
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
import { emitToCampaign, emitToUser } from '@/socket';

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
    // Show the full influencer pipeline — early stage AND active/post-payment stages
    // so the brand can always see every influencer's current status in this campaign
    const allVisibleStatuses = [
      'invited', 'applied', 'negotiating', 'accepted', 'payment_pending',
      'paid', 'product_pending', 'script_pending', 'script_review', 'work_pending', 'work_review',
      'completed', 'settled', 'rejected', 'withdrawn',
    ];
    conditions.push(inArray(campaignInfluencers.status, allVisibleStatuses as any));
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
      quotedPrice: campaignInfluencers.tierRate,
      agreedBudget: campaignInfluencers.agreedBudget,
      applicationNote: campaignInfluencers.applicationNote,
      appliedAt: campaignInfluencers.appliedAt,
      acceptedAt: campaignInfluencers.acceptedAt,
      paidAt: campaignInfluencers.paidAt,
      finalPaidAt: campaignInfluencers.finalPaidAt,
      completedAt: campaignInfluencers.completedAt,
      settledAt: campaignInfluencers.settledAt,
      updatedAt: campaignInfluencers.updatedAt,
      createdAt: campaignInfluencers.createdAt,
      // Influencer info
      handle: influencerProfiles.handle,
      bio: influencerProfiles.bio,
      tier: influencerProfiles.tier,
      followerCount: influencerProfiles.followerCount,
      engagementRate: influencerProfiles.engagementRate,
      niches: influencerProfiles.niches,
      platforms: influencerProfiles.platforms,
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
      quotedPrice: campaignInfluencers.tierRate,
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

  await assertInfluencerProfileComplete(influencerUser.influencerId, influencerUser.sub);

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
  if (campaignData.applicationDeadline) {
    const deadlineEnd = new Date(campaignData.applicationDeadline);
    deadlineEnd.setHours(23, 59, 59, 999);
    if (deadlineEnd < now) {
      throw new BadRequestError('Application deadline has passed');
    }
  }
  if (campaignData.workDeadline) {
    const workDeadlineEnd = new Date(campaignData.workDeadline);
    workDeadlineEnd.setHours(23, 59, 59, 999);
    if (workDeadlineEnd < now) {
      throw new BadRequestError('Work deadline has passed');
    }
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

  // Resolve tierRate:
  // 1) Prefer influencer's quoted amount when provided in application payload.
  // 2) Otherwise fallback to campaign tier pricing based on influencer tier.
  const tierPricing = (campaignData.budgetTierPricing || []) as Array<{ tier: string; rate: number }>;
  const quotedAmount = dto.amount ?? dto.proposedBudget;

  let tierRate: string | null;
  if (quotedAmount != null && quotedAmount > 0) {
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
    title: `"${campaignData.name}" - New Application`,
    message: 'A new influencer has applied to your campaign.',
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

  await assertInfluencerProfileComplete(influencerUser.influencerId, influencerUser.sub);

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
      title: `"${campaign.name}" - Invite Accepted`,
      message: 'An influencer has accepted your invite.',
      campaignId: campaignId,
      campaignName: campaign.name,
      actionUrl: `/campaigns/${campaignId}/applications`,
    });
  }

  // ─── Real-time update ─────────────────────────────────────────────────
  emitToCampaign(campaignId, 'CAMPAIGN_UPDATED', { id: campaignId });
  emitToUser(influencerUser.sub, 'APPLICATION_STATUS_CHANGED', { campaignId, status: 'accepted' });

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

  // ─── Real-time update ─────────────────────────────────────────────────
  emitToCampaign(campaignId, 'CAMPAIGN_UPDATED', { id: campaignId });

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
    title: `"${campaignName}" - Approved`,
    message: 'Your application has been approved! Chat opens once you reach the next stage.',
    campaignId: campaignId,
    campaignName: campaignName,
    actionUrl: `/campaigns/${campaignId}`,
  });

  // ─── Real-time update ─────────────────────────────────────────────────
  emitToCampaign(campaignId, 'CAMPAIGN_UPDATED', { id: campaignId });
  emitToUser(influencerUserId, 'APPLICATION_STATUS_CHANGED', { campaignId, status: 'accepted' });

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
    title: `"${campaignName}" - Application Update`,
    message: 'Your application was not accepted this time.',
    campaignId: campaignId,
    campaignName: campaignName,
    actionUrl: `/campaigns/${campaignId}`,
  });

  // ─── Real-time update ─────────────────────────────────────────────────
  emitToCampaign(campaignId, 'CAMPAIGN_UPDATED', { id: campaignId });
  emitToUser(influencerUserId, 'APPLICATION_STATUS_CHANGED', { campaignId, status: 'rejected' });

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
      // Brand info
      brandName: brandProfiles.brandName,
      brandLogoUrl: brandProfiles.brandLogoUrl,
    })
    .from(campaignInfluencers)
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .leftJoin(brandProfiles, eq(brandProfiles.id, campaigns.brandId))
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
    .set({ 
      productShippedAt: new Date(), 
      status: ci.status === 'accepted' ? 'product_pending' : ci.status,
      updatedAt: new Date() 
    })
    .where(eq(campaignInfluencers.id, appId))
    .returning();

  await createNotification({
    userId: influencerUserId,
    type: 'system',
    title: `"${campaignName}" - Product Shipped`,
    message: 'The product has been shipped to you!',
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
      scriptType: campaigns.scriptType,
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

  const nextStatus = ciData.scriptType === 'creator' ? 'script_pending' : 'work_pending';

  const [updated] = await db
    .update(campaignInfluencers)
    .set({ 
      productReceivedAt: new Date(), 
      status: ci.status === 'product_pending' ? nextStatus as any : ci.status,
      updatedAt: new Date() 
    })
    .where(eq(campaignInfluencers.id, ci.id))
    .returning();

  await createNotification({
    userId: brandUserId,
    type: 'system',
    title: `"${campaignName}" - Product Received`,
    message: 'The influencer has confirmed receiving the product.',
    campaignId,
    campaignName,
    actionUrl: `/campaigns/${campaignId}/applications`,
  });

  return updated;
}

export async function forceProductDelivered(
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
      scriptType: campaigns.scriptType,
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

  const nextStatus = ciData.scriptType === 'creator' ? 'script_pending' : 'work_pending';

  const [updated] = await db
    .update(campaignInfluencers)
    .set({ 
      productReceivedAt: new Date(), 
      status: ci.status === 'product_pending' ? nextStatus as any : ci.status,
      updatedAt: new Date() 
    })
    .where(eq(campaignInfluencers.id, appId))
    .returning();

  await createNotification({
    userId: influencerUserId,
    type: 'system',
    title: `"${campaignName}" - Product Confirmed Delivered`,
    message: 'The brand has confirmed product delivery. You can now proceed!',
    campaignId,
    campaignName,
    actionUrl: `/campaigns/${campaignId}`,
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

async function assertInfluencerProfileComplete(influencerId: string, userId: string) {
  const [profile] = await db
    .select({
      bio: influencerProfiles.bio,
      niches: influencerProfiles.niches,
      featuredPortfolioIds: influencerProfiles.featuredPortfolioIds,
    })
    .from(influencerProfiles)
    .where(eq(influencerProfiles.id, influencerId))
    .limit(1);

  if (!profile) throw new ForbiddenError('Influencer profile not found');

  const missing: string[] = [];
  if (!profile.bio || !profile.bio.trim()) missing.push('Bio');
  if (!profile.niches || profile.niches.length === 0) missing.push('Category');
  if (!profile.featuredPortfolioIds || profile.featuredPortfolioIds.length === 0) {
    // Check if influencer has ANY portfolio item
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(influencerPortfolios)
      .where(eq(influencerPortfolios.influencerId, influencerId));

    if (count === 0) {
      missing.push('Portfolio');
    }
  }

  const [bank] = await db
    .select({ id: bankDetails.id })
    .from(bankDetails)
    .where(eq(bankDetails.userId, userId))
    .limit(1);

  if (!bank) missing.push('Bank Details');

  if (missing.length > 0) {
    throw new BadRequestError(`Complete your profile to proceed: missing ${missing.join(', ')}.`);
  }
}

