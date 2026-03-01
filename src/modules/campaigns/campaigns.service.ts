import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { campaigns, brandProfiles, users } from '@/db/schema';
import { NotFoundError, ForbiddenError, BadRequestError } from '@/shared/errors';
import { parsePagination, buildPaginationMeta, getOffset } from '@/shared/utils/pagination';
import type { JWTPayload } from '@/shared/types/api';
import type { Campaign } from '@/db/schema';
import type { CreateCampaignDTO, UpdateCampaignDTO, ListCampaignsQuery } from './campaigns.schema';

// ─── Brand: list their own campaigns ─────────────────────────────────────────

export async function listCampaignsForBrand(brandUser: JWTPayload, query: ListCampaignsQuery) {
  if (!brandUser.brandId) throw new ForbiddenError('Brand profile not found');

  const { page, limit } = parsePagination(query);
  const offset = getOffset({ page, limit });

  const conditions = [eq(campaigns.brandId, brandUser.brandId)];
  if (query.status) conditions.push(eq(campaigns.status, query.status));
  if (query.type) conditions.push(eq(campaigns.type, query.type));
  if (query.visibility) conditions.push(eq(campaigns.visibility, query.visibility));

  const where = and(...conditions);

  const orderBy =
    query.sort === 'deadline'
      ? asc(campaigns.deadline)
      : query.sort === 'progress'
      ? desc(campaigns.progress)
      : desc(campaigns.createdAt);

  const rows = await db
    .select()
    .from(campaigns)
    .where(where)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(where);

  return { campaigns: rows, meta: buildPaginationMeta(count, { page, limit }) };
}

// ─── Influencer: discover public active campaigns ─────────────────────────────

export async function discoverCampaigns(query: ListCampaignsQuery) {
  const { page, limit } = parsePagination(query);
  const offset = getOffset({ page, limit });

  const conditions = [
    eq(campaigns.visibility, 'public'),
    eq(campaigns.status, 'active'),
  ];
  if (query.type) conditions.push(eq(campaigns.type, query.type));

  const where = and(...conditions);

  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      type: campaigns.type,
      objective: campaigns.objective,
      budgetMode: campaigns.budgetMode,
      budgetTierPricing: campaigns.budgetTierPricing,
      niches: campaigns.niches,
      creatorSizes: campaigns.creatorSizes,
      brief: campaigns.brief,
      deliverables: campaigns.deliverables,
      deadline: campaigns.deadline,
      thumbnailUrl: campaigns.thumbnailUrl,
      applicationsCount: campaigns.applicationsCount,
      // Brand info (safe to show)
      brandName: brandProfiles.brandName,
      brandLogoUrl: brandProfiles.brandLogoUrl,
    })
    .from(campaigns)
    .innerJoin(brandProfiles, eq(brandProfiles.id, campaigns.brandId))
    .where(where)
    .orderBy(desc(campaigns.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(where);

  return { campaigns: rows, meta: buildPaginationMeta(count, { page, limit }) };
}

// ─── Get single campaign ──────────────────────────────────────────────────────

export async function getCampaignById(id: string, requester: JWTPayload) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!campaign) throw new NotFoundError('Campaign');

  // Private campaigns: only brand owner, admin can view
  if (campaign.visibility === 'private') {
    if (requester.role === 'admin') return campaign;
    if (requester.role === 'brand_owner' && campaign.brandId === requester.brandId) return campaign;
    throw new ForbiddenError('This campaign is private');
  }

  return campaign;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createCampaign(brandUser: JWTPayload, dto: CreateCampaignDTO): Promise<Campaign> {
  if (!brandUser.brandId) throw new ForbiddenError('Brand profile not found');

  const [campaign] = await db
    .insert(campaigns)
    .values({
      brandId: brandUser.brandId,
      name: dto.name,
      type: dto.type,
      visibility: dto.visibility,
      objective: dto.objective,
      budgetMode: dto.budgetMode,
      budgetTierPricing: dto.budgetTierPricing,
      budgetTotal: dto.budgetTotal?.toString(),
      platformFeePercent: dto.platformFeePercent?.toString(),
      location: dto.location,
      niches: dto.niches,
      creatorSizes: dto.creatorSizes,
      brief: dto.brief,
      dos: dto.dos,
      donts: dto.donts,
      referenceUrls: dto.referenceUrls,
      hashtags: dto.hashtags,
      deliverables: dto.deliverables,
      proofOfWorkReq: dto.proofOfWorkReq,
      deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      status: 'draft',
    })
    .returning();

  return campaign;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateCampaign(
  id: string,
  brandUser: JWTPayload,
  dto: UpdateCampaignDTO
): Promise<Campaign> {
  const campaign = await assertOwnership(id, brandUser);

  if (campaign.status !== 'draft' && campaign.status !== 'active') {
    throw new BadRequestError('Campaign can only be edited when in draft or active status');
  }

  const [updated] = await db
    .update(campaigns)
    .set({
      ...dto,
      budgetTotal: dto.budgetTotal?.toString(),
      platformFeePercent: dto.platformFeePercent?.toString(),
      deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, id))
    .returning();

  return updated;
}

// ─── Delete (soft — just close) ───────────────────────────────────────────────

export async function deleteCampaign(id: string, brandUser: JWTPayload): Promise<void> {
  const campaign = await assertOwnership(id, brandUser);

  if (campaign.status === 'active') {
    throw new BadRequestError('Close or withdraw the campaign before deleting');
  }

  await db
    .update(campaigns)
    .set({ status: 'withdrawn', updatedAt: new Date() })
    .where(eq(campaigns.id, id));
}

// ─── Launch ───────────────────────────────────────────────────────────────────

export async function launchCampaign(id: string, brandUser: JWTPayload): Promise<Campaign> {
  const campaign = await assertOwnership(id, brandUser);

  if (campaign.status !== 'draft') {
    throw new BadRequestError('Only draft campaigns can be launched');
  }

  const [updated] = await db
    .update(campaigns)
    .set({ status: 'active', launchedAt: new Date(), updatedAt: new Date() })
    .where(eq(campaigns.id, id))
    .returning();

  return updated;
}

// ─── Close ────────────────────────────────────────────────────────────────────

export async function closeCampaign(id: string, brandUser: JWTPayload): Promise<Campaign> {
  const campaign = await assertOwnership(id, brandUser);

  if (!['active', 'script', 'work'].includes(campaign.status)) {
    throw new BadRequestError('Campaign cannot be closed from its current status');
  }

  const [updated] = await db
    .update(campaigns)
    .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
    .where(eq(campaigns.id, id))
    .returning();

  return updated;
}

// ─── Upload thumbnail ─────────────────────────────────────────────────────────

export async function updateCampaignThumbnail(
  id: string,
  brandUser: JWTPayload,
  filename: string
): Promise<Campaign> {
  await assertOwnership(id, brandUser);

  const [updated] = await db
    .update(campaigns)
    .set({ thumbnailUrl: `/files/submissions/${filename}`, updatedAt: new Date() })
    .where(eq(campaigns.id, id))
    .returning();

  return updated;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertOwnership(id: string, user: JWTPayload): Promise<Campaign> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) throw new NotFoundError('Campaign');
  if (user.role !== 'admin' && campaign.brandId !== user.brandId) {
    throw new ForbiddenError('You do not own this campaign');
  }
  return campaign;
}
