import { eq, ilike, and, gte, lte, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  influencerProfiles,
  users,
  campaigns,
  campaignInfluencers,
  brandProfiles,
} from '@/db/schema';
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from '@/shared/errors';
import type { InfluencerProfile } from '@/db/schema';
import type {
  UpdateInfluencerProfileDTO,
  SearchInfluencersQuery,
  InviteInfluencerDTO,
  BulkInviteDTO,
} from './influencers.schema';
import type { JWTPayload } from '@/shared/types/api';
import { parsePagination, buildPaginationMeta, getOffset } from '@/shared/utils/pagination';

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
      userAvatarUrl: users.avatarUrl,
    })
    .from(influencerProfiles)
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .where(eq(influencerProfiles.userId, userId))
    .limit(1);

  if (!profile) throw new NotFoundError('Influencer profile');
  return profile;
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

  const [updated] = await db
    .update(influencerProfiles)
    .set({
      ...dto,
      engagementRate: dto.engagementRate !== undefined ? String(dto.engagementRate) : undefined,
      updatedAt: new Date()
    })
    .where(eq(influencerProfiles.id, profile.id))
    .returning();

  return updated;
}

export async function updateInfluencerAvatar(userId: string, filename: string) {
  const [updated] = await db
    .update(users)
    .set({ avatarUrl: `/files/avatars/${filename}`, updatedAt: new Date() })
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
    })
    .from(influencerProfiles)
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .where(where)
    .limit(limit)
    .offset(offset);

  // Count total
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(influencerProfiles)
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .where(where);

  return {
    influencers: rows,
    meta: buildPaginationMeta(count, { page, limit }),
  };
}

export async function getInfluencerById(id: string) {
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
    })
    .from(influencerProfiles)
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .where(eq(influencerProfiles.id, id))
    .limit(1);

  if (!profile) throw new NotFoundError('Influencer');
  return profile;
}

// ─── Invite ──────────────────────────────────────────────────────────────────

export async function inviteInfluencer(brandUser: JWTPayload, dto: InviteInfluencerDTO) {
  if (!brandUser.brandId) throw new ForbiddenError('Brand profile not found');

  // Verify campaign belongs to this brand
  const [campaign] = await db
    .select({ id: campaigns.id, budgetTierPricing: campaigns.budgetTierPricing })
    .from(campaigns)
    .where(and(eq(campaigns.id, dto.campaignId), eq(campaigns.brandId, brandUser.brandId)))
    .limit(1);

  if (!campaign) throw new NotFoundError('Campaign');

  // Get influencer profile to determine tier_rate
  const [influencer] = await db
    .select({ id: influencerProfiles.id, tier: influencerProfiles.tier })
    .from(influencerProfiles)
    .where(eq(influencerProfiles.id, dto.influencerId))
    .limit(1);

  if (!influencer) throw new NotFoundError('Influencer');

  // Find tier_rate from campaign pricing
  const tierPricing = campaign.budgetTierPricing as Array<{ tier: string; rate: number }>;
  const tierEntry = tierPricing.find((t) => t.tier === influencer.tier);
  const tierRate = tierEntry ? tierEntry.rate.toString() : null;

  // Check for duplicate
  const [existing] = await db
    .select({ id: campaignInfluencers.id })
    .from(campaignInfluencers)
    .where(
      and(
        eq(campaignInfluencers.campaignId, dto.campaignId),
        eq(campaignInfluencers.influencerId, dto.influencerId)
      )
    )
    .limit(1);

  if (existing) throw new ConflictError('Influencer is already linked to this campaign');

  const [ci] = await db
    .insert(campaignInfluencers)
    .values({
      campaignId: dto.campaignId,
      influencerId: dto.influencerId,
      origin: 'brand_invite',
      status: 'invited',
      tierRate,
      applicationNote: dto.message,
    })
    .returning();

  // Increment creatorsInvited counter
  await db
    .update(campaigns)
    .set({ creatorsInvited: sql`${campaigns.creatorsInvited} + 1`, updatedAt: new Date() })
    .where(eq(campaigns.id, dto.campaignId));

  return ci;
}

export async function bulkInviteInfluencers(brandUser: JWTPayload, dto: BulkInviteDTO) {
  const results = await Promise.allSettled(
    dto.influencerIds.map((influencerId) =>
      inviteInfluencer(brandUser, {
        influencerId,
        campaignId: dto.campaignId,
        message: dto.message,
      })
    )
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { succeeded, failed, total: dto.influencerIds.length };
}
