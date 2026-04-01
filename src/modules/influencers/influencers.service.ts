import { eq, ilike, and, gte, lte, inArray, or, sql, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  influencerProfiles,
  users,
  campaigns,
  campaignInfluencers,
  brandProfiles,
  influencerPortfolios,
  bankDetails,
  brandInfluencerBookmarks,
} from '@/db/schema';
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from '@/shared/errors';
import type { InfluencerProfile } from '@/db/schema';
import type {
  UpdateInfluencerProfileDTO,
  SearchInfluencersQuery,
  InviteInfluencersDTO,
  AddPortfolioItemDTO,
  UpdatePortfolioItemDTO,
} from './influencers.schema';
import type { JWTPayload } from '@/shared/types/api';
import { parsePagination, buildPaginationMeta, getOffset } from '@/shared/utils/pagination';
import { createNotification } from '../notifications/notifications.service';

// ─── Own profile (influencer updates their own) ─────────────────────────────

export async function getOwnInfluencerProfile(userId: string) {
  const [profile] = await db
    .select({
      id: influencerProfiles.id,
      userId: influencerProfiles.userId,
      handle: influencerProfiles.handle,
      bio: influencerProfiles.bio,
      location: influencerProfiles.location,
      niches: influencerProfiles.niches,
      tier: influencerProfiles.tier,
      followerCount: influencerProfiles.followerCount,
      engagementRate: influencerProfiles.engagementRate,
      platforms: influencerProfiles.platforms,
      rateCard: influencerProfiles.rateCard,
      portfolioUrls: influencerProfiles.portfolioUrls,
      isVerified: influencerProfiles.isVerified,
      createdAt: influencerProfiles.createdAt,
      updatedAt: influencerProfiles.updatedAt,
      userName: users.name,
      userEmail: users.email,
      userPhoneNumber: users.phoneNumber,
      userAvatarUrl: users.avatarUrl,
    })
    .from(influencerProfiles)
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .where(eq(influencerProfiles.userId, userId))
    .limit(1);

  if (!profile) throw new NotFoundError('Influencer profile');

  const portfolio = await db
    .select()
    .from(influencerPortfolios)
    .where(eq(influencerPortfolios.influencerId, profile.id))
    .orderBy(sql`${influencerPortfolios.createdAt} DESC`);

  return { ...profile, portfolio };
}

export async function updateOwnInfluencerProfile(
  userId: string,
  dto: UpdateInfluencerProfileDTO
) {
  const [profile] = await db
    .select({ id: influencerProfiles.id })
    .from(influencerProfiles)
    .where(eq(influencerProfiles.userId, userId))
    .limit(1);

  if (!profile) throw new NotFoundError('Influencer profile');

  const { email, ...profileData } = dto;

  // Update email in users table if provided
  if (email) {
    await db
      .update(users)
      .set({ email, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  const [updated] = await db
    .update(influencerProfiles)
    .set({
      ...profileData,
      engagementRate: dto.engagementRate !== undefined ? String(dto.engagementRate) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(influencerProfiles.id, profile.id))
    .returning();

  return updated;
}

export async function updateInfluencerAvatar(userId: string, avatarUrl: string) {
  const [updated] = await db
    .update(users)
    .set({ avatarUrl, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ avatarUrl: users.avatarUrl });

  return updated;
}

// ─── Discover / Search (used by brands) ─────────────────────────────────────

export async function searchInfluencers(query: SearchInfluencersQuery) {
  const { page, limit } = parsePagination(query);
  const offset = getOffset({ page, limit });

  const conditions = [];

  if (query.q) {
    conditions.push(
      or(
        ilike(users.name, `%${query.q}%`),
        ilike(influencerProfiles.handle, `%${query.q}%`)
      )
    );
  }

  if (query.location) {
    conditions.push(ilike(influencerProfiles.location, `%${query.location}%`));
  }

  if (query.minFollowers !== undefined) {
    conditions.push(gte(influencerProfiles.followerCount, query.minFollowers));
  }
  if (query.maxFollowers !== undefined) {
    conditions.push(lte(influencerProfiles.followerCount, query.maxFollowers));
  }

  if (query.tier) {
    const tiers = Array.isArray(query.tier) ? query.tier : [query.tier];
    conditions.push(inArray(influencerProfiles.tier, tiers as Exclude<InfluencerProfile['tier'], null>[]));
  }

  if (query.savedOnly && query.brandId) {
    conditions.push(isNotNull(brandInfluencerBookmarks.id));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: influencerProfiles.id,
      handle: influencerProfiles.handle,
      bio: influencerProfiles.bio,
      location: influencerProfiles.location,
      niches: influencerProfiles.niches,
      tier: influencerProfiles.tier,
      followerCount: influencerProfiles.followerCount,
      engagementRate: influencerProfiles.engagementRate,
      platforms: influencerProfiles.platforms,
      rateCard: influencerProfiles.rateCard,
      portfolioUrls: influencerProfiles.portfolioUrls,
      isVerified: influencerProfiles.isVerified,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
      isBookmarked: sql<boolean>`CASE WHEN ${brandInfluencerBookmarks.id} IS NOT NULL THEN TRUE ELSE FALSE END`
    })
    .from(influencerProfiles)
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .leftJoin(brandInfluencerBookmarks, and(
      eq(brandInfluencerBookmarks.influencerId, influencerProfiles.id),
      query.brandId ? eq(brandInfluencerBookmarks.brandId, query.brandId) : sql`FALSE`
    ))
    .where(where)
    .limit(limit)
    .offset(offset);

  // Count total
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(influencerProfiles)
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .leftJoin(brandInfluencerBookmarks, and(
      eq(brandInfluencerBookmarks.influencerId, influencerProfiles.id),
      query.brandId ? eq(brandInfluencerBookmarks.brandId, query.brandId) : sql`FALSE`
    ))
    .where(where);

  return {
    influencers: rows,
    meta: buildPaginationMeta(count, { page, limit }),
  };
}

export async function getInfluencerById(id: string, brandId?: string) {
  const [profile] = await db
    .select({
      id: influencerProfiles.id,
      handle: influencerProfiles.handle,
      bio: influencerProfiles.bio,
      location: influencerProfiles.location,
      niches: influencerProfiles.niches,
      tier: influencerProfiles.tier,
      followerCount: influencerProfiles.followerCount,
      engagementRate: influencerProfiles.engagementRate,
      platforms: influencerProfiles.platforms,
      rateCard: influencerProfiles.rateCard,
      portfolioUrls: influencerProfiles.portfolioUrls,
      isVerified: influencerProfiles.isVerified,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
      isBookmarked: sql<boolean>`CASE WHEN ${brandInfluencerBookmarks.id} IS NOT NULL THEN TRUE ELSE FALSE END`
    })
    .from(influencerProfiles)
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .leftJoin(brandInfluencerBookmarks, and(
      eq(brandInfluencerBookmarks.influencerId, influencerProfiles.id),
      brandId ? eq(brandInfluencerBookmarks.brandId, brandId) : sql`FALSE`
    ))
    .where(eq(influencerProfiles.id, id))
    .limit(1);

  if (!profile) throw new NotFoundError('Influencer');

  const portfolio = await db
    .select()
    .from(influencerPortfolios)
    .where(eq(influencerPortfolios.influencerId, profile.id))
    .orderBy(sql`${influencerPortfolios.createdAt} DESC`);

  return { ...profile, portfolio };
}

// ─── Invite (unified: accepts 1–50 influencerIds) ───────────────────────────

async function inviteSingle(brandId: string, campaignId: string, campaign: { id: string; name: string; budgetTierPricing: unknown }, influencerId: string, message?: string) {
  const [influencer] = await db
    .select({ id: influencerProfiles.id, tier: influencerProfiles.tier, userId: influencerProfiles.userId })
    .from(influencerProfiles)
    .where(eq(influencerProfiles.id, influencerId))
    .limit(1);

  if (!influencer) throw new NotFoundError('Influencer');

  const tierPricing = (campaign.budgetTierPricing ?? []) as Array<{ tier: string; rate: number }>;
  const tierEntry = tierPricing.find((t) => t.tier === influencer.tier);
  const tierRate = tierEntry ? tierEntry.rate.toString() : null;

  const [existing] = await db
    .select({ id: campaignInfluencers.id })
    .from(campaignInfluencers)
    .where(and(eq(campaignInfluencers.campaignId, campaignId), eq(campaignInfluencers.influencerId, influencerId)))
    .limit(1);

  if (existing) throw new ConflictError('Influencer is already linked to this campaign');

  const [ci] = await db
    .insert(campaignInfluencers)
    .values({
      campaignId,
      influencerId,
      origin: 'brand_invite',
      status: 'invited',
      tierRate,
      applicationNote: message,
    })
    .returning();

  await db
    .update(campaigns)
    .set({ creatorsInvited: sql`${campaigns.creatorsInvited} + 1`, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  await createNotification({
    userId: influencer.userId,
    type: 'campaign_invite',
    title: 'Campaign Invite',
    message: `You've been invited to the campaign "${campaign.name}". Accept or decline below.`,
    campaignId,
    campaignName: campaign.name,
    actionUrl: `/campaigns/${campaignId}`,
  });

  return ci;
}

export async function inviteInfluencers(brandUser: JWTPayload, dto: InviteInfluencersDTO) {
  if (!brandUser.brandId) throw new ForbiddenError('Brand profile not found');

  const [campaign] = await db
    .select({ id: campaigns.id, name: campaigns.name, budgetTierPricing: campaigns.budgetTierPricing })
    .from(campaigns)
    .where(and(eq(campaigns.id, dto.campaignId), eq(campaigns.brandId, brandUser.brandId)))
    .limit(1);

  if (!campaign) throw new NotFoundError('Campaign');

  const results = await Promise.allSettled(
    dto.influencerIds.map((id) => inviteSingle(brandUser.brandId!, dto.campaignId, campaign, id, dto.message))
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => ({ reason: r.reason?.message ?? 'Unknown error' }));

  return { succeeded, failed: failed.length, errors: failed, total: dto.influencerIds.length };
}

// ─── Portfolio ───────────────────────────────────────────────────────────────

export async function addPortfolioItem(userId: string, dto: AddPortfolioItemDTO) {
  const [profile] = await db
    .select({ id: influencerProfiles.id })
    .from(influencerProfiles)
    .where(eq(influencerProfiles.userId, userId))
    .limit(1);

  if (!profile) throw new NotFoundError('Influencer profile');

  const [item] = await db
    .insert(influencerPortfolios)
    .values({
      influencerId: profile.id,
      ...dto,
    })
    .returning();

  return item;
}

export async function updatePortfolioItem(userId: string, itemId: string, dto: UpdatePortfolioItemDTO) {
  const [profile] = await db
    .select({ id: influencerProfiles.id })
    .from(influencerProfiles)
    .where(eq(influencerProfiles.userId, userId))
    .limit(1);

  if (!profile) throw new NotFoundError('Influencer profile');

  const [updated] = await db
    .update(influencerPortfolios)
    .set({ ...dto, updatedAt: new Date() })
    .where(and(eq(influencerPortfolios.id, itemId), eq(influencerPortfolios.influencerId, profile.id)))
    .returning();

  if (!updated) throw new NotFoundError('Portfolio item');
  return updated;
}

export async function deletePortfolioItem(userId: string, itemId: string) {
  const [profile] = await db
    .select({ id: influencerProfiles.id })
    .from(influencerProfiles)
    .where(eq(influencerProfiles.userId, userId))
    .limit(1);

  if (!profile) throw new NotFoundError('Influencer profile');

  const [deleted] = await db
    .delete(influencerPortfolios)
    .where(and(eq(influencerPortfolios.id, itemId), eq(influencerPortfolios.influencerId, profile.id)))
    .returning();

  if (!deleted) throw new NotFoundError('Portfolio item');
  return { success: true };
}

// ─── Bookmarks ───────────────────────────────────────────────────────────────

export async function toggleInfluencerBookmark(brandId: string, influencerId: string) {
  const [existing] = await db
    .select()
    .from(brandInfluencerBookmarks)
    .where(
      and(
        eq(brandInfluencerBookmarks.brandId, brandId),
        eq(brandInfluencerBookmarks.influencerId, influencerId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .delete(brandInfluencerBookmarks)
      .where(eq(brandInfluencerBookmarks.id, existing.id));
    return { isBookmarked: false };
  } else {
    await db.insert(brandInfluencerBookmarks).values({ brandId, influencerId });
    return { isBookmarked: true };
  }
}
