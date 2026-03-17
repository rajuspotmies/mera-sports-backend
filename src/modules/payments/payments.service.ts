import Razorpay from 'razorpay';
import { env } from '@/config/env';
import { db } from '@/db';
import {
  campaignInfluencers,
  campaigns,
  brandProfiles,
  influencerProfiles,
  campaignPayments,
  campaignPaymentItems,
} from '@/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { AppError, BadRequestError, NotFoundError, ForbiddenError } from '@/shared/errors';
import { createNotification } from '../notifications/notifications.service';
import type { JWTPayload } from '@/shared/types/api';

let razorpay: Razorpay | null = null;
function getRazorpay() {
  if (!razorpay) {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      throw new AppError('PAYMENT_CONFIG_MISSING', 'Razorpay keys are not configured');
    }
    razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
}

// ─── Initiate a payment round ────────────────────────────────────────────────
// Brand pays for all currently-accepted (unpaid) influencers in one Razorpay order.
// Supports multi-round top-ups: only CIs in 'accepted' status are included.

export async function initiatePaymentRound(
  campaignId: string,
  brandUser: JWTPayload,
  paymentType: 'advance' | 'final'
) {
  if (!brandUser.brandId) throw new ForbiddenError('Brand profile not found');

  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      brandId: campaigns.brandId,
      platformFeePercent: campaigns.platformFeePercent,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) throw new NotFoundError('Campaign');
  if (brandUser.role !== 'admin' && campaign.brandId !== brandUser.brandId) {
    throw new ForbiddenError('You do not own this campaign');
  }

  // Determine which CIs to include based on payment type
  const eligibleStatus = paymentType === 'advance' ? 'accepted' : 'work_review';

  const eligibleCIs = await db
    .select({
      id: campaignInfluencers.id,
      agreedBudget: campaignInfluencers.agreedBudget,
      tierRate: campaignInfluencers.tierRate,
      influencerId: campaignInfluencers.influencerId,
    })
    .from(campaignInfluencers)
    .where(
      and(
        eq(campaignInfluencers.campaignId, campaignId),
        eq(campaignInfluencers.status, eligibleStatus)
      )
    );

  if (eligibleCIs.length === 0) {
    throw new BadRequestError(
      paymentType === 'advance'
        ? 'No accepted influencers to pay. Ensure influencers have accepted their offers first.'
        : 'No influencers with completed work review to make final payment for.'
    );
  }

  // Calculate totals — use agreedBudget if set, else tierRate
  let influencerBudgetTotal = 0;
  const itemsToCreate: Array<{ ciId: string; budget: number }> = [];

  for (const ci of eligibleCIs) {
    const budget = Number(ci.agreedBudget ?? ci.tierRate ?? 0);
    if (budget <= 0) {
      throw new BadRequestError(
        `Influencer ${ci.influencerId} has no agreed budget or tier rate. Negotiate a rate first.`
      );
    }
    // For advance: 50% of agreed budget. For final: remaining 50%.
    const payableAmount = budget * 0.5;
    influencerBudgetTotal += payableAmount;
    itemsToCreate.push({ ciId: ci.id, budget: payableAmount });
  }

  const feePercent = Number(campaign.platformFeePercent ?? 10);
  const platformFeeAmount = (influencerBudgetTotal * feePercent) / 100;
  const totalAmount = influencerBudgetTotal + platformFeeAmount;

  // Determine round number
  const [lastPayment] = await db
    .select({ round: campaignPayments.round })
    .from(campaignPayments)
    .where(eq(campaignPayments.campaignId, campaignId))
    .orderBy(sql`${campaignPayments.round} DESC`)
    .limit(1);

  const round = (lastPayment?.round ?? 0) + 1;

  // Create Razorpay order
  const rzp = getRazorpay();
  const order = await rzp.orders.create({
    amount: Math.round(totalAmount * 100), // paise
    currency: 'INR',
    receipt: `cp_${campaignId}_r${round}_${paymentType}`,
    notes: { campaignId, round, paymentType },
  });

  // Insert campaign_payments row
  const [payment] = await db
    .insert(campaignPayments)
    .values({
      campaignId,
      brandUserId: brandUser.sub,
      round,
      paymentType,
      influencerBudgetTotal: influencerBudgetTotal.toFixed(2),
      platformFeePercent: feePercent.toFixed(2),
      platformFeeAmount: platformFeeAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      razorpayOrderId: order.id,
      status: 'pending',
    })
    .returning();

  // Insert payment items
  for (const item of itemsToCreate) {
    await db.insert(campaignPaymentItems).values({
      campaignPaymentId: payment.id,
      campaignInfluencerId: item.ciId,
      agreedBudget: item.budget.toFixed(2),
    });
  }

  // Move CIs to payment_pending
  const ciIds = eligibleCIs.map((ci) => ci.id);
  await db
    .update(campaignInfluencers)
    .set({ status: 'payment_pending', updatedAt: new Date() })
    .where(inArray(campaignInfluencers.id, ciIds));

  return {
    paymentId: payment.id,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    round,
    paymentType,
    influencersCount: eligibleCIs.length,
    breakdown: {
      influencerBudgetTotal: Number(influencerBudgetTotal.toFixed(2)),
      platformFeePercent: feePercent,
      platformFeeAmount: Number(platformFeeAmount.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
    },
  };
}

// ─── Handle Razorpay webhook confirmation ────────────────────────────────────

export async function handleCampaignPaymentSuccess(
  campaignId: string,
  round: number,
  paymentType: 'advance' | 'final',
  razorpayPaymentId?: string
) {
  const [payment] = await db
    .select()
    .from(campaignPayments)
    .where(
      and(
        eq(campaignPayments.campaignId, campaignId),
        eq(campaignPayments.round, round),
        eq(campaignPayments.status, 'pending')
      )
    )
    .limit(1);

  if (!payment) return;

  // Mark payment as captured
  await db
    .update(campaignPayments)
    .set({
      status: 'captured',
      razorpayPaymentId: razorpayPaymentId ?? null,
      capturedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(campaignPayments.id, payment.id));

  // Get all CIs in this payment round
  const items = await db
    .select({ campaignInfluencerId: campaignPaymentItems.campaignInfluencerId })
    .from(campaignPaymentItems)
    .where(eq(campaignPaymentItems.campaignPaymentId, payment.id));

  const ciIds = items.map((i) => i.campaignInfluencerId);

  if (ciIds.length === 0) return;

  const nextStatus = paymentType === 'advance' ? 'paid' : 'completed';
  const timestampField = paymentType === 'advance'
    ? { paidAt: new Date() }
    : { completedAt: new Date() };

  await db
    .update(campaignInfluencers)
    .set({ status: nextStatus, ...timestampField, updatedAt: new Date() })
    .where(inArray(campaignInfluencers.id, ciIds));

  // Notify influencers
  const ciDetails = await db
    .select({
      ciId: campaignInfluencers.id,
      influencerUserId: influencerProfiles.userId,
    })
    .from(campaignInfluencers)
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .where(inArray(campaignInfluencers.id, ciIds));

  const [campaign] = await db
    .select({ name: campaigns.name })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  const campaignName = campaign?.name ?? 'Unknown Campaign';

  for (const ci of ciDetails) {
    const title = paymentType === 'advance' ? 'Payment Received' : 'Final Payment Received';
    const message = paymentType === 'advance'
      ? `The advance payment for "${campaignName}" has been received. You can now start working!`
      : `The final payment for "${campaignName}" has been received. Great job!`;

    await createNotification({
      userId: ci.influencerUserId,
      type: 'payment',
      title,
      message,
      campaignId,
      campaignName,
      actionUrl: `/campaigns/${campaignId}`,
    });
  }

  // Notify brand
  const [brandData] = await db
    .select({ brandUserId: brandProfiles.userId })
    .from(campaigns)
    .innerJoin(brandProfiles, eq(brandProfiles.id, campaigns.brandId))
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (brandData) {
    const title = paymentType === 'advance' ? 'Payment Successful' : 'Final Payment Successful';
    const message = paymentType === 'advance'
      ? `Your advance payment for campaign "${campaignName}" (${ciIds.length} influencer(s)) was processed successfully.`
      : `Your final payment for campaign "${campaignName}" was processed successfully. Work is complete.`;

    await createNotification({
      userId: brandData.brandUserId,
      type: 'payment',
      title,
      message,
      campaignId,
      campaignName,
      actionUrl: `/campaigns/${campaignId}`,
    });
  }
}

// ─── Get payment summary for a campaign ──────────────────────────────────────

export async function getCampaignPaymentSummary(campaignId: string, requester: JWTPayload) {
  const [campaign] = await db
    .select({
      id: campaigns.id,
      brandId: campaigns.brandId,
      platformFeePercent: campaigns.platformFeePercent,
      budgetTotal: campaigns.budgetTotal,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) throw new NotFoundError('Campaign');

  // All payment rounds
  const paymentRounds = await db
    .select()
    .from(campaignPayments)
    .where(eq(campaignPayments.campaignId, campaignId))
    .orderBy(sql`${campaignPayments.round} ASC`);

  // Count CIs by status
  const ciCounts = await db
    .select({
      status: campaignInfluencers.status,
      count: sql<number>`count(*)::int`,
    })
    .from(campaignInfluencers)
    .where(eq(campaignInfluencers.campaignId, campaignId))
    .groupBy(campaignInfluencers.status);

  const statusMap = Object.fromEntries(ciCounts.map((c) => [c.status, c.count]));

  // Unpaid accepted CIs (eligible for next advance round)
  const [unpaidAccepted] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalBudget: sql<number>`coalesce(sum(coalesce(agreed_budget, tier_rate, 0)::numeric), 0)::float`,
    })
    .from(campaignInfluencers)
    .where(
      and(
        eq(campaignInfluencers.campaignId, campaignId),
        eq(campaignInfluencers.status, 'accepted')
      )
    );

  // Work-reviewed CIs (eligible for final payment)
  const [unpaidFinal] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalBudget: sql<number>`coalesce(sum(coalesce(agreed_budget, tier_rate, 0)::numeric), 0)::float`,
    })
    .from(campaignInfluencers)
    .where(
      and(
        eq(campaignInfluencers.campaignId, campaignId),
        eq(campaignInfluencers.status, 'work_review')
      )
    );

  const feePercent = Number(campaign.platformFeePercent ?? 10);

  return {
    campaignId,
    budgetTotal: campaign.budgetTotal ? Number(campaign.budgetTotal) : null,
    platformFeePercent: feePercent,
    paymentRounds,
    influencerStatusCounts: statusMap,
    nextAdvanceRound: {
      eligibleCount: unpaidAccepted.count,
      influencerTotal: unpaidAccepted.totalBudget * 0.5,
      platformFee: (unpaidAccepted.totalBudget * 0.5 * feePercent) / 100,
      grandTotal: unpaidAccepted.totalBudget * 0.5 * (1 + feePercent / 100),
    },
    nextFinalRound: {
      eligibleCount: unpaidFinal.count,
      influencerTotal: unpaidFinal.totalBudget * 0.5,
      platformFee: (unpaidFinal.totalBudget * 0.5 * feePercent) / 100,
      grandTotal: unpaidFinal.totalBudget * 0.5 * (1 + feePercent / 100),
    },
  };
}

// ─── Get payment round details ──────────────────────────────────────────────

export async function getPaymentRoundDetails(campaignId: string, paymentId: string) {
  const [payment] = await db
    .select()
    .from(campaignPayments)
    .where(and(eq(campaignPayments.id, paymentId), eq(campaignPayments.campaignId, campaignId)))
    .limit(1);

  if (!payment) throw new NotFoundError('Payment round');

  const items = await db
    .select({
      id: campaignPaymentItems.id,
      campaignInfluencerId: campaignPaymentItems.campaignInfluencerId,
      agreedBudget: campaignPaymentItems.agreedBudget,
      influencerHandle: influencerProfiles.handle,
      influencerTier: influencerProfiles.tier,
    })
    .from(campaignPaymentItems)
    .innerJoin(
      campaignInfluencers,
      eq(campaignInfluencers.id, campaignPaymentItems.campaignInfluencerId)
    )
    .innerJoin(
      influencerProfiles,
      eq(influencerProfiles.id, campaignInfluencers.influencerId)
    )
    .where(eq(campaignPaymentItems.campaignPaymentId, paymentId));

  return { payment, items };
}
