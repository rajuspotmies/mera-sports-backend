import { eq, and, ilike, or, sql, isNull, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  users,
  campaigns,
  campaignInfluencers,
  influencerProfiles,
  brandProfiles,
  settlements,
  reports,
  bankDetails,
} from '@/db/schema';
import { NotFoundError } from '@/shared/errors';
import { parsePagination, buildPaginationMeta, getOffset } from '@/shared/utils/pagination';
import type {
  ListUsersQuery,
  UpdateUserStatusDTO,
  ListAdminCampaignsQuery,
  ListReportsQuery,
} from './admin.schema';

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const [
    [{ totalUsers }],
    [{ activeCampaigns }],
    [{ pendingSettlements }],
    [{ totalSettled }],
  ] = await Promise.all([
    db.select({ totalUsers: sql<number>`count(*)::int` }).from(users)
      .where(sql`${users.role} != 'admin'`),
    db.select({ activeCampaigns: sql<number>`count(*)::int` }).from(campaigns)
      .where(eq(campaigns.status, 'active')),
    db.select({ pendingSettlements: sql<number>`count(*)::int` }).from(campaignInfluencers)
      .where(eq(campaignInfluencers.status, 'completed')),
    db.select({ totalSettled: sql<string>`coalesce(sum(amount), 0)::text` }).from(settlements),
  ]);

  return { totalUsers, activeCampaigns, pendingSettlements, totalSettled };
}

// ─── User Management ──────────────────────────────────────────────────────────

export async function listUsers(query: ListUsersQuery) {
  const options = parsePagination(query);
  const offset = getOffset(options);

  const conditions: ReturnType<typeof eq>[] = [sql`${users.role} != 'admin'` as unknown as ReturnType<typeof eq>];
  if (query.role)     conditions.push(eq(users.role, query.role));
  if (query.isActive !== undefined) conditions.push(eq(users.isActive, query.isActive));
  if (query.q) {
    conditions.push(
      or(
        ilike(users.name, `%${query.q}%`),
        ilike(users.email, `%${query.q}%`),
      ) as unknown as ReturnType<typeof eq>
    );
  }

  const where = and(...conditions);

  const [rows, [{ count }]] = await Promise.all([
    db.select({
      id:          users.id,
      name:        users.name,
      email:       users.email,
      phoneNumber: users.phoneNumber,
      role:        users.role,
      isVerified:  users.isVerified,
      isActive:    users.isActive,
      createdAt:   users.createdAt,
      avatarUrl:   users.avatarUrl,
    })
      .from(users)
      .where(where)
      .orderBy(sql`${users.createdAt} DESC`)
      .limit(options.limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(users).where(where),
  ]);

  return { users: rows, meta: buildPaginationMeta(count, options) };
}

export async function getUserDetail(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError('User');

  let profile: unknown = null;
  if (user.role === 'influencer') {
    const [inf] = await db.select().from(influencerProfiles)
      .where(eq(influencerProfiles.userId, userId)).limit(1);
    profile = inf ?? null;
  } else if (user.role === 'brand_owner') {
    const [brand] = await db.select().from(brandProfiles)
      .where(eq(brandProfiles.userId, userId)).limit(1);
    profile = brand ?? null;
  }

  return { user, profile };
}

export async function updateUserStatus(userId: string, dto: UpdateUserStatusDTO) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!existing) throw new NotFoundError('User');

  const [updated] = await db
    .update(users)
    .set({ isActive: dto.isActive, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ id: users.id, isActive: users.isActive });

  return updated;
}

// ─── Campaign Overview ────────────────────────────────────────────────────────

export async function listAdminCampaigns(query: ListAdminCampaignsQuery) {
  const options = parsePagination(query);
  const offset = getOffset(options);

  const conditions = [];
  if (query.status)  conditions.push(eq(campaigns.status, query.status));
  if (query.brandId) conditions.push(eq(campaigns.brandId, query.brandId));

  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db.select({
      id:               campaigns.id,
      name:             campaigns.name,
      type:             campaigns.type,
      status:           campaigns.status,
      budgetMode:       campaigns.budgetMode,
      budgetTotal:      campaigns.budgetTotal,
      creatorsInvited:  campaigns.creatorsInvited,
      creatorsAccepted: campaigns.creatorsAccepted,
      progress:         campaigns.progress,
      launchedAt:       campaigns.launchedAt,
      createdAt:        campaigns.createdAt,
      brandName:        brandProfiles.brandName,
    })
      .from(campaigns)
      .innerJoin(brandProfiles, eq(brandProfiles.id, campaigns.brandId))
      .where(where)
      .orderBy(sql`${campaigns.createdAt} DESC`)
      .limit(options.limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(campaigns).where(where),
  ]);

  return { campaigns: rows, meta: buildPaginationMeta(count, options) };
}

export async function getAdminCampaignDetail(campaignId: string) {
  const [row] = await db
    .select({
      id:               campaigns.id,
      name:             campaigns.name,
      description:      campaigns.description,
      status:           campaigns.status,
      budgetMode:       campaigns.budgetMode,
      budgetTotal:      campaigns.budgetTotal,
      creatorsInvited:  campaigns.creatorsInvited,
      creatorsAccepted: campaigns.creatorsAccepted,
      progress:         campaigns.progress,
      launchedAt:       campaigns.launchedAt,
      workDeadline:     campaigns.workDeadline,
      closedAt:         campaigns.closedAt,
      createdAt:        campaigns.createdAt,
      updatedAt:        campaigns.updatedAt,
      brandId:          campaigns.brandId,
      brandName:        brandProfiles.brandName,
      brandLogoUrl:     brandProfiles.brandLogoUrl,
    })
    .from(campaigns)
    .innerJoin(brandProfiles, eq(brandProfiles.id, campaigns.brandId))
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!row) throw new NotFoundError('Campaign');

  const influencerRows = await db
    .select({
      ciId:              campaignInfluencers.id,
      status:            campaignInfluencers.status,
      origin:            campaignInfluencers.origin,
      agreedBudget:      campaignInfluencers.agreedBudget,
      tierRate:          campaignInfluencers.tierRate,
      platformFee:       campaignInfluencers.platformFee,
      acceptedAt:        campaignInfluencers.acceptedAt,
      completedAt:       campaignInfluencers.completedAt,
      settledAt:         campaignInfluencers.settledAt,
      influencerId:      influencerProfiles.id,
      handle:            influencerProfiles.handle,
      tier:              influencerProfiles.tier,
      followerCount:     influencerProfiles.followerCount,
      influencerUserId:  influencerProfiles.userId,
      influencerName:    users.name,
      influencerAvatar:  users.avatarUrl,
    })
    .from(campaignInfluencers)
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .where(eq(campaignInfluencers.campaignId, campaignId))
    .orderBy(sql`${campaignInfluencers.createdAt} DESC`);

  return { campaign: row, influencers: influencerRows };
}

// ─── Reports Management ───────────────────────────────────────────────────────

export async function listAdminReports(query: ListReportsQuery) {
  const options = parsePagination(query);
  const offset = getOffset(options);

  const conditions = [];
  if (query.resolved === true)  conditions.push(isNotNull(reports.resolvedAt));
  if (query.resolved === false) conditions.push(isNull(reports.resolvedAt));
  if (query.reason)             conditions.push(eq(reports.reason, query.reason));

  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db.select({
      id:           reports.id,
      targetId:     reports.targetId,
      targetType:   reports.targetType,
      reason:       reports.reason,
      description:  reports.description,
      contextType:  reports.contextType,
      contextId:    reports.contextId,
      createdAt:    reports.createdAt,
      resolvedAt:   reports.resolvedAt,
      resolvedBy:   reports.resolvedBy,
      reporterName:  users.name,
      reporterEmail: users.email,
    })
      .from(reports)
      .innerJoin(users, eq(users.id, reports.reporterId))
      .where(where)
      .orderBy(sql`${reports.createdAt} DESC`)
      .limit(options.limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(reports).where(where),
  ]);

  return { reports: rows, meta: buildPaginationMeta(count, options) };
}

export async function resolveReport(adminUserId: string, reportId: string) {
  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(eq(reports.id, reportId))
    .limit(1);
  if (!existing) throw new NotFoundError('Report');

  const [updated] = await db
    .update(reports)
    .set({ resolvedAt: new Date(), resolvedBy: adminUserId })
    .where(eq(reports.id, reportId))
    .returning();

  return updated;
}

// ─── Bank Details (admin view for settling) ───────────────────────────────────

export async function getInfluencerBankDetails(influencerUserId: string) {
  const [row] = await db
    .select()
    .from(bankDetails)
    .where(eq(bankDetails.userId, influencerUserId))
    .limit(1);

  if (!row) throw new NotFoundError('Bank details for this influencer');
  return row;
}
