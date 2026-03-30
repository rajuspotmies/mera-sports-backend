import { db } from '@/db';
import {
  campaignInfluencers,
  campaigns,
  influencerProfiles,
  settlements,
  users,
} from '@/db/schema';
import { BadRequestError, NotFoundError } from '@/shared/errors';
import { and, eq, sql } from 'drizzle-orm';
import { createNotification } from '../notifications/notifications.service';

// ─── List influencers eligible for settlement ────────────────────────────────
// "completed" CIs whose work is done and brand has made final payment.

export async function listUnsettledInfluencers(campaignId?: string) {
  const conditions = [
    // completed = work done + final payment captured; not yet settled
    eq(campaignInfluencers.status, 'completed'),
  ];

  if (campaignId) {
    conditions.push(eq(campaignInfluencers.campaignId, campaignId));
  }

  const rows = await db
    .select({
      ciId: campaignInfluencers.id,
      campaignId: campaignInfluencers.campaignId,
      campaignName: campaigns.name,
      influencerId: campaignInfluencers.influencerId,
      influencerName: users.name,
      influencerEmail: users.email,
      influencerAvatar: users.avatarUrl,
      influencerHandle: influencerProfiles.handle,
      influencerUserId: influencerProfiles.userId,
      agreedBudget: campaignInfluencers.agreedBudget,
      tierRate: campaignInfluencers.tierRate,
      platformFee: campaignInfluencers.platformFee,
      paidAt: campaignInfluencers.paidAt,
      completedAt: campaignInfluencers.completedAt,
    })
    .from(campaignInfluencers)
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .where(and(...conditions))
    .orderBy(sql`${campaignInfluencers.completedAt} ASC`);

  return rows;
}

// ─── Settle an influencer ────────────────────────────────────────────────────

export async function settleInfluencer(
  adminUserId: string,
  ciId: string,
  dto: { amount: number; method: 'bank_transfer' | 'upi' | 'other'; reference?: string; notes?: string }
) {
  const [ci] = await db
    .select({
      id: campaignInfluencers.id,
      status: campaignInfluencers.status,
      campaignId: campaignInfluencers.campaignId,
      influencerUserId: influencerProfiles.userId,
      campaignName: campaigns.name,
    })
    .from(campaignInfluencers)
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .where(eq(campaignInfluencers.id, ciId))
    .limit(1);

  if (!ci) throw new NotFoundError('Campaign influencer');

  if (ci.status !== 'completed') {
    throw new BadRequestError(
      `Cannot settle: influencer status is "${ci.status}". Must be "completed" first.`
    );
  }

  // Insert settlement record
  const [settlement] = await db
    .insert(settlements)
    .values({
      campaignInfluencerId: ciId,
      adminUserId,
      amount: dto.amount.toFixed(2),
      method: dto.method,
      reference: dto.reference,
      notes: dto.notes,
    })
    .returning();

  // Update CI to settled
  await db
    .update(campaignInfluencers)
    .set({ status: 'settled', settledAt: new Date(), updatedAt: new Date() })
    .where(eq(campaignInfluencers.id, ciId));

  // Notify influencer
  await createNotification({
    userId: ci.influencerUserId,
    type: 'payment',
    title: 'Payout Received',
    message: `Your payout of ₹${dto.amount.toLocaleString()} for campaign "${ci.campaignName}" has been sent via ${dto.method.replace('_', ' ')}.`,
    campaignId: ci.campaignId,
    campaignName: ci.campaignName,
    actionUrl: `/campaigns/${ci.campaignId}`,
  });

  return settlement;
}

// ─── List all settlements (admin view) ──────────────────────────────────────

export async function listSettlements(campaignId?: string) {
  const conditions = [];
  if (campaignId) {
    conditions.push(eq(campaignInfluencers.campaignId, campaignId));
  }

  const rows = await db
    .select({
      id: settlements.id,
      ciId: settlements.campaignInfluencerId,
      campaignId: campaignInfluencers.campaignId,
      campaignName: campaigns.name,
      influencerName: users.name,
      influencerEmail: users.email,
      influencerAvatar: users.avatarUrl,
      influencerHandle: influencerProfiles.handle,
      amount: settlements.amount,
      method: settlements.method,
      reference: settlements.reference,
      notes: settlements.notes,
      settledAt: settlements.settledAt,
    })
    .from(settlements)
    .innerJoin(
      campaignInfluencers,
      eq(campaignInfluencers.id, settlements.campaignInfluencerId)
    )
    .innerJoin(
      influencerProfiles,
      eq(influencerProfiles.id, campaignInfluencers.influencerId)
    )
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${settlements.settledAt} DESC`);

  return rows;
}
