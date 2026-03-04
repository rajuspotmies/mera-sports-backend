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
      name: dto.name || '',
      type: dto.type || 'influencer',
      visibility: dto.visibility || 'private',
      objective: dto.objective || dto.budget?.productDetails,
      budgetMode: dto.budgetMode || dto.budget?.mode || 'paid',
      budgetTierPricing: (dto.budgetTierPricing && dto.budgetTierPricing.length > 0)
        ? dto.budgetTierPricing
        : (dto.budget?.tierPricing?.map(t => ({ tier: t.tier, rate: t.amount })) || []),
      budgetTotal: (dto.budgetTotal ?? dto.budget?.total)?.toString(),
      platformFeePercent: (dto.platformFeePercent ?? dto.budget?.platformFeePercent)?.toString() || '10',
      location: dto.location || dto.productLocation,
      niches: dto.niches || [],
      creatorSizes: (dto.creatorSizes && dto.creatorSizes.length > 0) ? dto.creatorSizes : (dto.budget?.creatorSizes || []),
      brief: dto.brief || dto.requirements?.brandGuidelines,
      dos: dto.dos || [],
      donts: dto.donts || [],
      referenceUrls: (dto.referenceUrls && dto.referenceUrls.length > 0) ? dto.referenceUrls : (dto.requirements?.references ? dto.requirements.references.split('\n').filter(Boolean) : []),
      hashtags: dto.hashtags || [],
      deliverables: (dto.deliverables && dto.deliverables.length > 0) ? dto.deliverables : (dto.requirements?.contentTypes?.map(c => ({ type: c, count: 1 })) || []),
      proofOfWorkReq: dto.proofOfWorkReq || false,
      deadline: dto.deadline ? new Date(dto.deadline) : (dto.timeline?.applicationDeadline ? new Date(dto.timeline.applicationDeadline) : undefined),
      status: dto.status || 'draft',
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

  const mappedUpdate: any = {};
  if (dto.name !== undefined) mappedUpdate.name = dto.name;
  if (dto.type !== undefined) mappedUpdate.type = dto.type;
  if (dto.visibility !== undefined) mappedUpdate.visibility = dto.visibility;
  if (dto.status !== undefined) mappedUpdate.status = dto.status;
  if (dto.objective !== undefined || dto.budget?.productDetails !== undefined) mappedUpdate.objective = dto.objective || dto.budget?.productDetails;
  if (dto.budgetMode !== undefined || dto.budget?.mode !== undefined) mappedUpdate.budgetMode = dto.budgetMode || dto.budget?.mode;
  if (dto.budgetTierPricing?.length || dto.budget?.tierPricing) mappedUpdate.budgetTierPricing = dto.budgetTierPricing?.length ? dto.budgetTierPricing : dto.budget?.tierPricing?.map(t => ({ tier: t.tier, rate: t.amount })) || [];
  if (dto.budgetTotal !== undefined || dto.budget?.total !== undefined) mappedUpdate.budgetTotal = (dto.budgetTotal ?? dto.budget?.total)?.toString();
  if (dto.platformFeePercent !== undefined || dto.budget?.platformFeePercent !== undefined) mappedUpdate.platformFeePercent = (dto.platformFeePercent ?? dto.budget?.platformFeePercent)?.toString();
  if (dto.location !== undefined || dto.productLocation !== undefined) mappedUpdate.location = dto.location || dto.productLocation;
  if (dto.niches !== undefined) mappedUpdate.niches = dto.niches;
  if (dto.creatorSizes?.length || dto.budget?.creatorSizes) mappedUpdate.creatorSizes = dto.creatorSizes?.length ? dto.creatorSizes : dto.budget?.creatorSizes || [];
  if (dto.brief !== undefined || dto.requirements?.brandGuidelines !== undefined) mappedUpdate.brief = dto.brief || dto.requirements?.brandGuidelines;
  if (dto.dos !== undefined) mappedUpdate.dos = dto.dos;
  if (dto.donts !== undefined) mappedUpdate.donts = dto.donts;
  if (dto.referenceUrls?.length || dto.requirements?.references) mappedUpdate.referenceUrls = dto.referenceUrls?.length ? dto.referenceUrls : (dto.requirements?.references ? dto.requirements.references.split('\n').filter(Boolean) : []);
  if (dto.hashtags !== undefined) mappedUpdate.hashtags = dto.hashtags;
  if (dto.deliverables?.length || dto.requirements?.contentTypes) mappedUpdate.deliverables = dto.deliverables?.length ? dto.deliverables : dto.requirements?.contentTypes?.map(c => ({ type: c, count: 1 })) || [];
  if (dto.proofOfWorkReq !== undefined) mappedUpdate.proofOfWorkReq = dto.proofOfWorkReq;
  if (dto.deadline || dto.timeline?.applicationDeadline) {
    const dl = dto.deadline || dto.timeline?.applicationDeadline;
    mappedUpdate.deadline = dl ? new Date(dl) : undefined;
  }
  mappedUpdate.updatedAt = new Date();

  // Make sure we remove undefined keys
  Object.keys(mappedUpdate).forEach(key => mappedUpdate[key] === undefined && delete mappedUpdate[key]);

  const [updated] = await db
    .update(campaigns)
    .set(mappedUpdate)
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
  thumbnailUrl: string
): Promise<Campaign> {
  await assertOwnership(id, brandUser);

  const [updated] = await db
    .update(campaigns)
    .set({ thumbnailUrl, updatedAt: new Date() })
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
