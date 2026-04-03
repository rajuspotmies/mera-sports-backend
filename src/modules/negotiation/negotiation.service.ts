import { eq, and, asc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { negotiations, campaignInfluencers, campaigns, brandProfiles, influencerProfiles } from '@/db/schema';
import { createNotification } from '../notifications/notifications.service';
import { NotFoundError, ForbiddenError, BadRequestError } from '@/shared/errors';
import type { JWTPayload } from '@/shared/types/api';
import type { CounterOfferDTO, AcceptOfferDTO } from './negotiation.schema';

// ─── Get negotiation history ──────────────────────────────────────────────────

export async function getNegotiationHistory(
  campaignId: string,
  influencerId: string,
  requester: JWTPayload
) {
  const ci = await getCIAndVerifyAccess(campaignId, influencerId, requester);

  const history = await db
    .select()
    .from(negotiations)
    .where(eq(negotiations.campaignInfluencerId, ci.id))
    .orderBy(asc(negotiations.createdAt));

  // Determine who made the last offer
  let lastOfferBy: 'brand' | 'influencer';
  if (history.length > 0) {
    lastOfferBy = history[history.length - 1].party;
  } else {
    // If no negotiation history, fall back to the initial offer based on origin
    lastOfferBy = ci.origin === 'brand_invite' ? 'brand' : 'influencer';
  }

  const requesterRole = requester.role === 'brand_owner' || requester.role === 'admin' ? 'brand' : 'influencer';
  const isMyTurn = requesterRole !== lastOfferBy;

  return {
    campaignId: ci.campaignId,
    influencerId: ci.influencerId,
    campaignInfluencerId: ci.id,
    status: ci.status,
    tierRate: ci.tierRate,
    agreedBudget: ci.agreedBudget,
    lastOfferBy,
    permissions: {
      canAccept: isMyTurn && ['invited', 'applied', 'negotiating'].includes(ci.status),
      canCounter: isMyTurn && ['invited', 'applied', 'negotiating', 'accepted'].includes(ci.status),
    },
    history,
  };
}

// ─── Counter offer ────────────────────────────────────────────────────────────
// Either brand or influencer can make a counter offer.
// State: invited/applied → negotiating (also accepted → negotiating if reopened)

export async function counterOffer(
  campaignId: string,
  influencerId: string,
  requester: JWTPayload,
  dto: CounterOfferDTO
) {
  const ci = await getCIAndVerifyAccess(campaignId, influencerId, requester);

  // Determine party
  const party: 'brand' | 'influencer' =
    requester.role === 'brand_owner' || requester.role === 'admin' ? 'brand' : 'influencer';

  // Valid statuses to counter from
  const allowedStatuses = ['invited', 'applied', 'negotiating', 'accepted'];
  if (!allowedStatuses.includes(ci.status)) {
    throw new BadRequestError(
      `Cannot make a counter offer when status is '${ci.status}'`
    );
  }

  // Record the negotiation entry
  const [entry] = await db
    .insert(negotiations)
    .values({
      campaignInfluencerId: ci.id,
      party,
      amount: dto.amount.toString(),
      note: dto.note,
    })
    .returning();

  // Update status to negotiating + update tierRate to reflect current offer
  await db
    .update(campaignInfluencers)
    .set({
      status: 'negotiating',
      tierRate: dto.amount.toString(), // latest offer becomes the current rate
      updatedAt: new Date(),
    })
    .where(eq(campaignInfluencers.id, ci.id));

  // ─── Notify the other party ────────────────────────────────────────────────
  const recipientUserId = party === 'brand' ? ci.influencerUserId : ci.brandUserId;
  await createNotification({
    userId: recipientUserId,
    type: 'negotiation',
    title: 'New Counter Offer',
    message: `You received a counter offer for the campaign "${ci.campaignName}".`,
    campaignId: ci.campaignId,
    campaignName: ci.campaignName,
    actionUrl: `/negotiation/${ci.campaignId}/${ci.influencerId}`,
  });

  return entry;
}

// ─── Accept offer ─────────────────────────────────────────────────────────────
// Either party can accept the CURRENT offer.
// Accepting moves status → accepted + sets agreed_budget

export async function acceptOffer(
  campaignId: string,
  influencerId: string,
  requester: JWTPayload,
  dto: AcceptOfferDTO
) {
  const ci = await getCIAndVerifyAccess(campaignId, influencerId, requester);

  const allowedStatuses = ['invited', 'applied', 'negotiating'];
  if (!allowedStatuses.includes(ci.status)) {
    throw new BadRequestError(
      `Cannot accept offer when status is '${ci.status}'`
    );
  }

  // Verify that the requester is NOT the one who made the last offer
  const [lastNegotiation] = await db
    .select({ party: negotiations.party })
    .from(negotiations)
    .where(eq(negotiations.campaignInfluencerId, ci.id))
    .orderBy(sql`${negotiations.createdAt} DESC`)
    .limit(1);

  const lastOfferBy = lastNegotiation ? lastNegotiation.party : (ci.origin === 'brand_invite' ? 'brand' : 'influencer');
  const requesterRole = requester.role === 'brand_owner' || requester.role === 'admin' ? 'brand' : 'influencer';

  if (requesterRole === lastOfferBy) {
    throw new BadRequestError('You cannot accept your own offer. Please wait for the other party to respond.');
  }

  const party: 'brand' | 'influencer' =
    requester.role === 'brand_owner' || requester.role === 'admin' ? 'brand' : 'influencer';

  // Record acceptance as a negotiation entry
  await db.insert(negotiations).values({
    campaignInfluencerId: ci.id,
    party,
    amount: dto.amount.toString(),
    note: 'Offer accepted',
  });

  // Compute platform fee + split payments
  const platformFeePercent = 10; // default 10%
  const platformFee = dto.amount * (platformFeePercent / 100);
  const netAmount = dto.amount - platformFee;
  const firstPayment = netAmount * 0.5;
  const finalPayment = netAmount * 0.5;

  // Update CI: accepted + agreed_budget + chat_enabled
  const [updated] = await db
    .update(campaignInfluencers)
    .set({
      status: 'accepted',
      agreedBudget: dto.amount.toString(),
      platformFee: platformFee.toString(),
      firstPayment: firstPayment.toString(),
      finalPayment: finalPayment.toString(),
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(campaignInfluencers.id, ci.id))
    .returning();

  // Increment creatorsAccepted if not already done
  if (!ci.acceptedAt) {
    await db
      .update(campaigns)
      .set({ creatorsAccepted: sql`${campaigns.creatorsAccepted} + 1`, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
  }

  // ─── Notify the other party ────────────────────────────────────────────────
  const recipientUserId = party === 'brand' ? ci.influencerUserId : ci.brandUserId;
  await createNotification({
    userId: recipientUserId,
    type: 'negotiation',
    title: 'Offer Accepted',
    message: `The offer for "${ci.campaignName}" has been accepted!`,
    campaignId: ci.campaignId,
    campaignName: ci.campaignName,
    actionUrl: `/negotiation/${ci.campaignId}/${ci.influencerId}`,
  });

  return updated;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCIAndVerifyAccess(
  campaignId: string,
  influencerId: string,
  requester: JWTPayload
) {
  const [ci] = await db
    .select({
      id: campaignInfluencers.id,
      campaignId: campaignInfluencers.campaignId,
      influencerId: campaignInfluencers.influencerId,
      origin: campaignInfluencers.origin,
      status: campaignInfluencers.status,
      tierRate: campaignInfluencers.tierRate,
      agreedBudget: campaignInfluencers.agreedBudget,
      acceptedAt: campaignInfluencers.acceptedAt,
      influencerUserId: influencerProfiles.userId,
      brandUserId: brandProfiles.userId,
      campaignName: campaigns.name,
      campaignBrandId: campaigns.brandId, // Added to verify brand access
    })
    .from(campaignInfluencers)
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .innerJoin(brandProfiles, eq(brandProfiles.id, campaigns.brandId))
    .where(
      and(
        eq(campaignInfluencers.campaignId, campaignId),
        eq(campaignInfluencers.influencerId, influencerId)
      )
    )
    .limit(1);

  if (!ci) throw new NotFoundError('Negotiation thread not found');

  // Access control:
  // - brand_owner: must own the campaign
  // - influencer: must be the linked influencer
  // - admin: full access
  if (requester.role === 'brand_owner') {

    if (ci.campaignBrandId !== requester.brandId) {
      throw new ForbiddenError('You do not own this campaign');
    }
  } else if (requester.role === 'influencer') {
    if (ci.influencerId !== requester.influencerId) {
      throw new ForbiddenError('You are not part of this negotiation');
    }
  }

  return ci;
}

