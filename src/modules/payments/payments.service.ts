import crypto from 'crypto';
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

async function advanceCIsAfterPayment(
  ciIds: string[],
  campaignId: string
) {
  const [campaign] = await db
    .select({ scriptType: campaigns.scriptType })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  const scriptType = campaign?.scriptType;

  if (scriptType === 'creator') {
    await db
      .update(campaignInfluencers)
      .set({ status: 'script_pending', updatedAt: new Date() })
      .where(inArray(campaignInfluencers.id, ciIds));
  } else {
    await db
      .update(campaignInfluencers)
      .set({ status: 'work_pending', updatedAt: new Date() })
      .where(inArray(campaignInfluencers.id, ciIds));
  }
}

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
  paymentType: 'advance' | 'final',
  ciIdsSpec?: string[]
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

  // Advance: from accepted CIs. Final: from work_review (content approved, awaiting payment).
  const eligibleStatus = paymentType === 'advance' ? 'accepted' : 'work_review';

  // Status conditions
  const conditions = [
    eq(campaignInfluencers.campaignId, campaignId),
    eq(campaignInfluencers.status, eligibleStatus),
  ];

  // If specific IDs are requested, include them
  if (ciIdsSpec && ciIdsSpec.length > 0) {
    conditions.push(inArray(campaignInfluencers.id, ciIdsSpec));
  }

  const eligibleCIs = await db
    .select({
      id: campaignInfluencers.id,
      agreedBudget: campaignInfluencers.agreedBudget,
      tierRate: campaignInfluencers.tierRate,
      influencerId: campaignInfluencers.influencerId,
    })
    .from(campaignInfluencers)
    .where(and(...conditions));

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
  let order;
  try {
    order = await rzp.orders.create({
      amount: Math.round(totalAmount * 100), // paise
      currency: 'INR',
      // Razorpay receipt limit is 40 characters. UUID (36) + prefix/suffix exceeds this.
      // We use a shorter identifier: round + type + first 8 of campaign ID.
      receipt: `r${round}_${paymentType.substring(0, 3)}_${campaignId.split('-')[0]}`,
      notes: { campaignId, round, paymentType },
    });
  } catch (err: any) {
    // Log the specific Razorpay error message if possible
    const errorMsg = err?.error?.description || err?.message || 'Razorpay order creation failed';
    throw new AppError('PAYMENT_INIT_FAILED', errorMsg, 400);
  }

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

export async function verifyPayment(
  campaignId: string,
  dto: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  requester: JWTPayload
) {
  // 1. Verify ownership
  await assertBrandOwnsCampaign(campaignId, requester);

  // 2. Compute signature
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new AppError('CONFIG_ERROR', 'Razorpay secret missing');
  
  const body = dto.razorpayOrderId + "|" + dto.razorpayPaymentId;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  if (expectedSignature !== dto.razorpaySignature) {
    throw new AppError('PAYMENT_VERIFICATION_FAILED', 'Invalid payment signature');
  }

  // 3. Find the payment record to get round and type
  const [payment] = await db
    .select()
    .from(campaignPayments)
    .where(eq(campaignPayments.razorpayOrderId, dto.razorpayOrderId))
    .limit(1);

  if (!payment) throw new NotFoundError('Payment order not found');

  // 4. Advance states (using existing helper)
  await handleCampaignPaymentSuccess(
    payment.campaignId,
    payment.round,
    payment.paymentType as any,
    dto.razorpayPaymentId
  );

  return { success: true, paymentType: payment.paymentType };
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

  if (paymentType === 'advance') {
    await db
      .update(campaignInfluencers)
      .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
      .where(inArray(campaignInfluencers.id, ciIds));

    await advanceCIsAfterPayment(ciIds, campaignId);
  } else {
    await db
      .update(campaignInfluencers)
      .set({
        status: 'completed',
        finalPaidAt: new Date(),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(campaignInfluencers.id, ciIds));
  }

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertBrandOwnsCampaign(id: string, user: JWTPayload) {
  const [campaign] = await db
    .select({ id: campaigns.id, brandId: campaigns.brandId })
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!campaign) throw new NotFoundError('Campaign');
  if (user.role !== 'admin' && campaign.brandId !== user.brandId) {
    throw new ForbiddenError('You do not own this campaign');
  }
}
