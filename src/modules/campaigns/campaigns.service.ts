import { eq, and, desc, asc, sql, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import { campaigns, brandProfiles, users, campaignInfluencers, influencerProfiles } from '@/db/schema';
import { createNotification } from '../notifications/notifications.service';
import { NotFoundError, ForbiddenError, BadRequestError } from '@/shared/errors';
import { parsePagination, buildPaginationMeta, getOffset } from '@/shared/utils/pagination';
import type { JWTPayload } from '@/shared/types/api';
import { emitToCampaign, emitToUser } from '@/socket';
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
      niches: campaigns.niches,
      creatorSizes: campaigns.creatorSizes,
      brief: campaigns.brief,
      deliverables: campaigns.deliverables,
      deadline: campaigns.deadline,
      thumbnailUrl: campaigns.thumbnailUrl,
      applicationsCount: campaigns.applicationsCount,
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
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);

  if (!campaign) throw new NotFoundError('Campaign');

  // Private campaigns: only brand owner, admin can view
  if (campaign.visibility === 'private') {
    if (requester.role === 'admin') return campaign;

    if (requester.role === 'brand_owner' && campaign.brandId === requester.brandId) {
      return campaign;
    }

    if (requester.role === 'influencer' && requester.influencerId) {
      const [ci] = await db
        .select({ id: campaignInfluencers.id })
        .from(campaignInfluencers)
        .where(
          and(
            eq(campaignInfluencers.campaignId, campaign.id),
            eq(campaignInfluencers.influencerId, requester.influencerId)
          )
        )
        .limit(1);

      if (ci) return stripTierPricingForInfluencer(campaign);
    }

    throw new ForbiddenError('This campaign is private');
  }

  if (requester.role === 'influencer') {
    return stripTierPricingForInfluencer(campaign);
  }

  return campaign;
}

function stripTierPricingForInfluencer(campaign: Campaign) {
  const { budgetTierPricing, budgetTotal, ...safe } = campaign;
  return safe;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createCampaign(brandUser: JWTPayload, dto: CreateCampaignDTO): Promise<Campaign> {
  if (!brandUser.brandId) throw new ForbiddenError('Brand profile not found');

  // Prefer new structured payload (basics/deliverables/budget/meta) but keep
  // backward compatibility with legacy flat fields where possible.
  const basics = dto.basics;
  const deliverables = dto.deliverables;
  const budget = dto.budget;
  const meta = dto.meta;

  const name = basics?.campaignName ?? dto.name ?? '';
  const type = basics?.type ?? dto.type ?? 'influencer';
  const visibility = basics?.visibility ?? dto.visibility ?? 'private';
  const objective = basics?.objective ?? dto.objective ?? budget?.productDetails ?? '';

  const budgetMode = budget?.budgetMode ?? 'paid';

  const budgetTierPricing =
    budget?.tierConfig?.map((t: any) => ({ tier: t.tier, rate: t.amount })) ?? [];

  const budgetTotal = budget?.totalBudget?.toString() || '0';
  const platformFeePercent = budget?.platformFeePercent?.toString() || '10';

  const location = basics?.location ?? '';
  const niches = basics?.niche ? [basics.niche] : [];
  const creatorSizes = budget?.creatorSizes ?? [];

  const brief = deliverables?.brandGuidelines ?? '';
  const referenceUrls = deliverables?.references 
    ? (Array.isArray(deliverables.references) ? deliverables.references : [deliverables.references]) 
    : [];

  const hashtags = meta?.hashtags ?? [];
  const deliverablesArray = deliverables?.contentTypes?.map((c: string) => ({ type: c, count: 1 })) ?? [];
  const proofOfWorkReq = deliverables?.proofOfWorkRequired ?? false;

  const normalizeDeadline = (dateStr?: string) => {
    if (!dateStr) return undefined;
    const d = new Date(dateStr);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  const applicationDeadline = normalizeDeadline(budget?.applicationDeadline);
  const workDeadline = normalizeDeadline(budget?.workDeadline);
  const scriptDeadline = normalizeDeadline(budget?.scriptDeadline);

  const thumbnailUrl = basics?.coverImageUrl ?? (dto as any).thumbnailUrl;
  const platform = deliverables?.platform;
  const contentTypes = deliverables?.contentTypes ?? [];
  const postingType = deliverables?.postingType;
  const usageRights = deliverables?.usageRights;
  const scriptType = deliverables?.scriptType;
  const scriptFlow = deliverables?.scriptFlow;
  const scriptFileKey = deliverables?.scriptFileName;
  const mixMode = budget?.mixMode;
  const selectedTier = budget?.selectedTier;
  const productDetails = budget?.productDetails;
  const status = meta?.status ?? dto.status ?? 'draft';

  const [campaign] = await db
    .insert(campaigns)
    .values({
      brandId: brandUser.brandId,
      name,
      type,
      visibility,
      objective,
      budgetMode,
      budgetTierPricing,
      budgetTotal,
      platformFeePercent,
      location,
      niches,
      creatorSizes,
      brief,
      dos: (dto as any).dos || [],
      donts: (dto as any).donts || [],
      referenceUrls,
      hashtags,
      deliverables: deliverablesArray,
      proofOfWorkReq,
      deadline: applicationDeadline,
      applicationDeadline,
      workDeadline,
      scriptDeadline,
      thumbnailUrl,
      platform,
      contentTypes,
      postingType,
      usageRights,
      scriptType,
      scriptFlow,
      scriptFileKey,
      mixMode,
      selectedTier,
      productDetails,
      status,
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

  const basics = dto.basics;
  const deliverables = dto.deliverables;
  const budget = dto.budget;
  const meta = dto.meta;

  const normalizeDeadline = (dateStr?: string) => {
    if (!dateStr) return undefined;
    const d = new Date(dateStr);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  // Structured fields
  if (basics?.campaignName !== undefined) mappedUpdate.name = basics.campaignName;
  if (basics?.type !== undefined) mappedUpdate.type = basics.type;
  if (basics?.visibility !== undefined) mappedUpdate.visibility = basics.visibility;
  if (basics?.objective !== undefined) mappedUpdate.objective = basics.objective;
  if (basics?.location !== undefined) mappedUpdate.location = basics.location;
  if (basics?.niche !== undefined) mappedUpdate.niches = [basics.niche];
  if (basics?.coverImageUrl !== undefined) mappedUpdate.thumbnailUrl = basics.coverImageUrl;

  if (deliverables?.brandGuidelines !== undefined) mappedUpdate.brief = deliverables.brandGuidelines;
  if (deliverables?.references !== undefined) {
    mappedUpdate.referenceUrls = Array.isArray(deliverables.references) ? deliverables.references : [deliverables.references];
  }
  if (deliverables?.proofOfWorkRequired !== undefined) mappedUpdate.proofOfWorkReq = deliverables.proofOfWorkRequired;
  if (deliverables?.platform !== undefined) mappedUpdate.platform = deliverables.platform;
  if (deliverables?.contentTypes !== undefined) mappedUpdate.contentTypes = deliverables.contentTypes;
  if (deliverables?.postingType !== undefined) mappedUpdate.postingType = deliverables.postingType;
  if (deliverables?.usageRights !== undefined) mappedUpdate.usageRights = deliverables.usageRights;
  if (deliverables?.scriptType !== undefined) mappedUpdate.scriptType = deliverables.scriptType;
  if (deliverables?.scriptFlow !== undefined) mappedUpdate.scriptFlow = deliverables.scriptFlow;
  if (deliverables?.scriptFileName !== undefined) mappedUpdate.scriptFileKey = deliverables.scriptFileName;

  if (budget?.budgetMode !== undefined) mappedUpdate.budgetMode = budget.budgetMode;
  if (budget?.tierConfig !== undefined) {
    mappedUpdate.budgetTierPricing = budget.tierConfig.map((t: any) => ({ tier: t.tier, rate: t.amount }));
  }
  if (budget?.totalBudget !== undefined) mappedUpdate.budgetTotal = budget.totalBudget.toString();
  if (budget?.platformFeePercent !== undefined) mappedUpdate.platformFeePercent = budget.platformFeePercent.toString();
  if (budget?.creatorSizes !== undefined) mappedUpdate.creatorSizes = budget.creatorSizes;
  if (budget?.mixMode !== undefined) mappedUpdate.mixMode = budget.mixMode;
  if (budget?.selectedTier !== undefined) mappedUpdate.selectedTier = budget.selectedTier;
  if (budget?.productDetails !== undefined) mappedUpdate.productDetails = budget.productDetails;

  if (budget?.applicationDeadline !== undefined) {
    const d = normalizeDeadline(budget.applicationDeadline);
    mappedUpdate.deadline = d;
    mappedUpdate.applicationDeadline = d;
  }
  if (budget?.workDeadline !== undefined) mappedUpdate.workDeadline = normalizeDeadline(budget.workDeadline);
  if (budget?.scriptDeadline !== undefined) mappedUpdate.scriptDeadline = normalizeDeadline(budget.scriptDeadline);

  if (meta?.status !== undefined) mappedUpdate.status = meta.status;
  if (meta?.referenceUrls !== undefined) mappedUpdate.referenceUrls = meta.referenceUrls;
  if (meta?.hashtags !== undefined) mappedUpdate.hashtags = meta.hashtags;
  if (meta?.proofOfWorkReq !== undefined) mappedUpdate.proofOfWorkReq = meta.proofOfWorkReq;

  // Legacy flat fields
  if (dto.name !== undefined) mappedUpdate.name = dto.name;
  if (dto.type !== undefined) mappedUpdate.type = dto.type;
  if (dto.visibility !== undefined) mappedUpdate.visibility = dto.visibility;
  if (dto.status !== undefined) mappedUpdate.status = dto.status;
  if (dto.objective !== undefined) mappedUpdate.objective = dto.objective;

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

  // 1. Update campaign status
  await db
    .update(campaigns)
    .set({ status: 'withdrawn', updatedAt: new Date() })
    .where(eq(campaigns.id, id));

  // 2. Find all active collaborations that need to be withdrawn
  const activeStatuses = ['invited', 'applied', 'negotiating', 'accepted', 'payment_pending', 'paid', 'script_pending', 'script_review', 'work_pending', 'work_review'];

  const activeCIs = await db
    .select({
      ciId: campaignInfluencers.id,
      influencerUserId: influencerProfiles.userId,
    })
    .from(campaignInfluencers)
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .where(
      and(
        eq(campaignInfluencers.campaignId, id),
        sql`${campaignInfluencers.status} IN ${activeStatuses}`
      )
    );

  if (activeCIs.length > 0) {
    // 3. Update all active CIs to withdrawn
    await db
      .update(campaignInfluencers)
      .set({ status: 'withdrawn', updatedAt: new Date() })
      .where(
        and(
          eq(campaignInfluencers.campaignId, id),
          sql`${campaignInfluencers.status} IN ${activeStatuses}`
        )
      );

    // 4. Notify each influencer
    for (const ci of activeCIs) {
      await createNotification({
        userId: ci.influencerUserId,
        type: 'system',
        title: 'Campaign Withdrawn',
        message: `The campaign "${campaign.name}" has been withdrawn by the brand.`,
        campaignId: id,
        campaignName: campaign.name,
        actionUrl: `/campaigns/${id}`,
      });
    }
  }

  // ─── Real-time emission ───────────────────────────────────────────────────
  emitToCampaign(id, 'CAMPAIGN_UPDATED', { id, status: 'withdrawn' });
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

  // Real-time update for all viewers
  emitToCampaign(id, 'CAMPAIGN_UPDATED', updated);

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

  // Real-time update for all viewers
  emitToCampaign(id, 'CAMPAIGN_UPDATED', updated);

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
