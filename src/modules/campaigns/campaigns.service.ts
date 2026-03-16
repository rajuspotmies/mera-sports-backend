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

  // TODO: extend to return normalized basics/deliverables/budget/meta + derived flags
  return campaign;
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
  const objective =
    basics?.objective ?? dto.objective ?? budget?.productDetails ?? dto.budget?.productDetails;

  const budgetMode =
    budget?.budgetMode ?? dto.budgetMode ?? dto.budget?.mode ?? 'paid';

  const budgetTierPricing =
    budget?.tierConfig?.map((t) => ({ tier: t.tier, rate: t.amount })) ??
    dto.budgetTierPricing ??
    dto.budget?.tierPricing?.map((t) => ({ tier: t.tier, rate: t.amount })) ??
    [];

  const budgetTotal =
    (budget?.totalBudget ?? dto.budgetTotal ?? dto.budget?.total)?.toString();

  const platformFeePercent =
    (budget?.platformFeePercent ??
      dto.platformFeePercent ??
      dto.budget?.platformFeePercent)?.toString() || '10';

  const location =
    basics?.location ?? dto.location ?? dto.productLocation;

  const niches =
    (basics?.niche ? [basics.niche] : undefined) ?? dto.niches ?? [];

  const creatorSizes =
    (budget?.creatorSizes && budget.creatorSizes.length > 0
      ? budget.creatorSizes
      : undefined) ??
    dto.creatorSizes ??
    dto.budget?.creatorSizes ??
    [];

  const brief =
    deliverables?.brandGuidelines ??
    dto.brief ??
    dto.requirements?.brandGuidelines;

  const referenceUrls =
    (Array.isArray(deliverables?.references)
      ? deliverables?.references
      : deliverables?.references
        ? [deliverables.references]
        : undefined) ??
    dto.referenceUrls ??
    (dto.requirements?.references
      ? dto.requirements.references.split('\n').filter(Boolean)
      : undefined) ??
    [];

  const hashtags = meta?.hashtags ?? dto.hashtags ?? [];

  const deliverablesArray =
    dto.deliverables && dto.deliverables.length > 0
      ? dto.deliverables
      : dto.requirements?.contentTypes?.map((c) => ({ type: c, count: 1 })) ??
        [];

  const proofOfWorkReq =
    deliverables?.proofOfWorkRequired ??
    meta?.proofOfWorkReq ??
    dto.proofOfWorkReq ??
    false;

  const applicationDeadlineStr =
    budget?.applicationDeadline ?? dto.timeline?.applicationDeadline ?? dto.deadline;
  const workDeadlineStr =
    budget?.workDeadline ?? dto.timeline?.workDeadline;
  const scriptDeadlineStr =
    budget?.scriptDeadline ?? dto.timeline?.scriptDeadline;

  const applicationDeadline = applicationDeadlineStr
    ? new Date(applicationDeadlineStr)
    : undefined;
  const workDeadline = workDeadlineStr ? new Date(workDeadlineStr) : undefined;
  const scriptDeadline = scriptDeadlineStr ? new Date(scriptDeadlineStr) : undefined;

  const thumbnailUrl = basics?.coverImageUrl ?? dto.thumbnailUrl;

  const platform =
    deliverables?.platform ?? dto.requirements?.platform;

  const contentTypes =
    deliverables?.contentTypes ??
    dto.requirements?.contentTypes ??
    [];

  const postingType =
    deliverables?.postingType ?? dto.requirements?.postingType;

  const usageRights =
    deliverables?.usageRights ?? undefined;

  const scriptType =
    deliverables?.scriptType ?? dto.requirements?.scriptType;

  const scriptFlow =
    deliverables?.scriptFlow ?? undefined;

  const scriptFileKey =
    deliverables?.scriptFileName ?? undefined;

  const creatorStrategy =
    budget?.creatorStrategy ?? dto.budget?.strategy;

  const mixMode =
    budget?.mixMode ?? dto.budget?.mixMode;

  const selectedTier =
    budget?.selectedTier ?? dto.budget?.selectedTier;

  const productDetails =
    budget?.productDetails ?? dto.budget?.productDetails;

  const status =
    meta?.status ?? dto.status ?? 'draft';

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
      dos: dto.dos || [],
      donts: dto.donts || [],
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
      creatorStrategy,
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

  // ─── New structured payload fields (basics / deliverables / budget / meta) ───

  // Basics
  if (basics?.campaignName !== undefined) mappedUpdate.name = basics.campaignName;
  if (basics?.type !== undefined) mappedUpdate.type = basics.type;
  if (basics?.visibility !== undefined) mappedUpdate.visibility = basics.visibility;
  if (
    basics?.objective !== undefined ||
    budget?.productDetails !== undefined
  ) {
    mappedUpdate.objective = basics?.objective ?? budget?.productDetails;
  }
  if (basics?.location !== undefined) mappedUpdate.location = basics.location;
  if (basics?.niche !== undefined) mappedUpdate.niches = [basics.niche];

  // Deliverables / creative
  if (deliverables?.brandGuidelines !== undefined) mappedUpdate.brief = deliverables.brandGuidelines;
  if (deliverables?.references !== undefined) {
    if (Array.isArray(deliverables.references)) {
      mappedUpdate.referenceUrls = deliverables.references;
    } else if (deliverables.references) {
      mappedUpdate.referenceUrls = [deliverables.references];
    } else {
      mappedUpdate.referenceUrls = [];
    }
  }
  if (meta?.referenceUrls !== undefined) mappedUpdate.referenceUrls = meta.referenceUrls;
  if (meta?.hashtags !== undefined) mappedUpdate.hashtags = meta.hashtags;

  if (deliverables?.proofOfWorkRequired !== undefined) {
    mappedUpdate.proofOfWorkReq = deliverables.proofOfWorkRequired;
  }
  if (meta?.proofOfWorkReq !== undefined) {
    mappedUpdate.proofOfWorkReq = meta.proofOfWorkReq;
  }

  if (deliverables?.platform !== undefined) mappedUpdate.platform = deliverables.platform;
  if (deliverables?.contentTypes !== undefined) mappedUpdate.contentTypes = deliverables.contentTypes;
  if (deliverables?.postingType !== undefined) mappedUpdate.postingType = deliverables.postingType;
  if (deliverables?.usageRights !== undefined) mappedUpdate.usageRights = deliverables.usageRights;
  if (deliverables?.scriptType !== undefined) mappedUpdate.scriptType = deliverables.scriptType;
  if (deliverables?.scriptFlow !== undefined) mappedUpdate.scriptFlow = deliverables.scriptFlow;
  if (deliverables?.scriptFileName !== undefined) mappedUpdate.scriptFileKey = deliverables.scriptFileName || null;

  // Budget
  if (budget?.budgetMode !== undefined || dto.budgetMode !== undefined || dto.budget?.mode !== undefined) {
    mappedUpdate.budgetMode = budget?.budgetMode ?? dto.budgetMode ?? dto.budget?.mode;
  }
  if (budget?.tierConfig !== undefined || dto.budgetTierPricing?.length || dto.budget?.tierPricing) {
    if (budget?.tierConfig) {
      mappedUpdate.budgetTierPricing = budget.tierConfig.map((t) => ({ tier: t.tier, rate: t.amount }));
    } else if (dto.budgetTierPricing?.length) {
      mappedUpdate.budgetTierPricing = dto.budgetTierPricing;
    } else if (dto.budget?.tierPricing) {
      mappedUpdate.budgetTierPricing = dto.budget.tierPricing.map((t) => ({ tier: t.tier, rate: t.amount }));
    }
  }
  if (budget?.totalBudget !== undefined || dto.budgetTotal !== undefined || dto.budget?.total !== undefined) {
    mappedUpdate.budgetTotal = (budget?.totalBudget ?? dto.budgetTotal ?? dto.budget?.total)?.toString();
  }
  if (
    budget?.platformFeePercent !== undefined ||
    dto.platformFeePercent !== undefined ||
    dto.budget?.platformFeePercent !== undefined
  ) {
    mappedUpdate.platformFeePercent = (
      budget?.platformFeePercent ??
      dto.platformFeePercent ??
      dto.budget?.platformFeePercent
    )?.toString();
  }

  if (budget?.creatorSizes !== undefined || dto.creatorSizes?.length || dto.budget?.creatorSizes) {
    mappedUpdate.creatorSizes =
      budget?.creatorSizes ??
      (dto.creatorSizes?.length ? dto.creatorSizes : dto.budget?.creatorSizes) ??
      [];
  }

  if (budget?.creatorStrategy !== undefined || dto.budget?.strategy !== undefined) {
    mappedUpdate.creatorStrategy = budget?.creatorStrategy ?? dto.budget?.strategy;
  }
  if (budget?.mixMode !== undefined || dto.budget?.mixMode !== undefined) {
    mappedUpdate.mixMode = budget?.mixMode ?? dto.budget?.mixMode;
  }
  if (budget?.selectedTier !== undefined || dto.budget?.selectedTier !== undefined) {
    mappedUpdate.selectedTier = budget?.selectedTier ?? dto.budget?.selectedTier;
  }
  if (budget?.productDetails !== undefined || dto.budget?.productDetails !== undefined) {
    mappedUpdate.productDetails = budget?.productDetails ?? dto.budget?.productDetails;
  }

  if (budget?.applicationDeadline || dto.timeline?.applicationDeadline || dto.deadline) {
    const dl = budget?.applicationDeadline ?? dto.timeline?.applicationDeadline ?? dto.deadline;
    mappedUpdate.deadline = dl ? new Date(dl) : null;
    mappedUpdate.applicationDeadline = dl ? new Date(dl) : null;
  }
  if (budget?.workDeadline || dto.timeline?.workDeadline) {
    const wd = budget?.workDeadline ?? dto.timeline?.workDeadline;
    mappedUpdate.workDeadline = wd ? new Date(wd) : null;
  }
  if (budget?.scriptDeadline || dto.timeline?.scriptDeadline) {
    const sd = budget?.scriptDeadline ?? dto.timeline?.scriptDeadline;
    mappedUpdate.scriptDeadline = sd ? new Date(sd) : null;
  }

  // Thumbnail
  if (basics?.coverImageUrl !== undefined || (dto as any).thumbnailUrl !== undefined) {
    mappedUpdate.thumbnailUrl = basics?.coverImageUrl ?? (dto as any).thumbnailUrl;
  }

  // Status (meta or legacy)
  if (meta?.status !== undefined || dto.status !== undefined) {
    mappedUpdate.status = meta?.status ?? dto.status;
  }

  // Legacy for backward compatibility (kept below)
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
