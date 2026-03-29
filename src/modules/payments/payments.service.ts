import Razorpay from 'razorpay';
import crypto from 'crypto';
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
import { emitToCampaign } from '@/socket';
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

async function sendPaymentNotifications(
  campaignId: string,
  ciIds: string[],
  paymentType: 'advance' | 'final'
) {
  if (!ciIds.length) return;

  const ciDetails = await db
    .select({
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
    const message =
      paymentType === 'advance'
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

  const [brandData] = await db
    .select({ brandUserId: brandProfiles.userId })
    .from(campaigns)
    .innerJoin(brandProfiles, eq(brandProfiles.id, campaigns.brandId))
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (brandData) {
    const title = paymentType === 'advance' ? 'Payment Successful' : 'Final Payment Successful';
    const message =
      paymentType === 'advance'
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

async function assertBrandOwnsCampaign(campaignId: string, user: JWTPayload) {
  if (user.role !== 'admin' && !user.brandId) {
    throw new ForbiddenError('Brand profile not found');
  }

  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      brandId: campaigns.brandId,
      platformFeePercent: campaigns.platformFeePercent,
      budgetTotal: campaigns.budgetTotal,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) throw new NotFoundError('Campaign');
  if (user.role !== 'admin' && campaign.brandId !== user.brandId) {
    throw new ForbiddenError('You do not own this campaign');
  }

  return campaign;
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
  ciIds?: string[]
) {
  const campaign = await assertBrandOwnsCampaign(campaignId, brandUser);

  // Advance: from accepted CIs. Final: from work_review (content approved, awaiting payment).
  const eligibleStatus = paymentType === 'advance' ? 'accepted' : 'work_review';

  let eligibleCIs = await db
    .select({
      id: campaignInfluencers.id,
      agreedBudget: campaignInfluencers.agreedBudget,
      tierRate: campaignInfluencers.tierRate,
      influencerId: campaignInfluencers.influencerId,
      influencerTier: influencerProfiles.tier,
      budgetTierPricing: campaigns.budgetTierPricing,
    })
    .from(campaignInfluencers)
    .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .where(
      and(
        eq(campaignInfluencers.campaignId, campaignId),
        eq(campaignInfluencers.status, eligibleStatus)
      )
    );

  if (ciIds?.length) {
    const selectedSet = new Set(ciIds);
    eligibleCIs = eligibleCIs.filter((ci) => selectedSet.has(ci.id));
  }

  if (eligibleCIs.length === 0) {
    throw new BadRequestError(
      paymentType === 'advance'
        ? 'No eligible accepted influencers found for selected payment.'
        : 'No eligible work_review influencers found for selected payment.'
    );
  }

  // Calculate totals — use agreedBudget if set, else tierRate
  let influencerBudgetTotal = 0;
  const itemsToCreate: Array<{ ciId: string; budget: number }> = [];

  for (const ci of eligibleCIs) {
    let budget = Number(ci.agreedBudget ?? ci.tierRate ?? 0);
    if (budget <= 0) {
      const pricing = (ci.budgetTierPricing || []) as Array<{ tier: string; rate: number }>;
      const matchedTier = pricing.find((p) => p.tier === ci.influencerTier);
      if (matchedTier?.rate && matchedTier.rate > 0) {
        budget = Number(matchedTier.rate);
      } else if (pricing.length === 1 && Number(pricing[0]?.rate) > 0) {
        budget = Number(pricing[0].rate);
      }
    }
    if (budget <= 0) {
      throw new BadRequestError(
        `Influencer ${ci.influencerId} has no quoted/agreed budget. Please add the quoted price before payment.`
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

  if (totalAmount <= 0) {
    throw new BadRequestError('Payment amount must be greater than 0');
  }

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
  console.log('Creating Razorpay order:', { amount: Math.round(totalAmount * 100), currency: 'INR' });
  const order = await rzp.orders.create({
    amount: Math.round(totalAmount * 100), // paise
    currency: 'INR',
    receipt: `r${round}_${paymentType}_${campaignId.split('-')[0]}`,
    notes: { campaignId, round, paymentType },
  });
  console.log('Razorpay order created:', order.id, order.amount);

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
  const selectedCiIds = eligibleCIs.map((ci) => ci.id);
  await db
    .update(campaignInfluencers)
    .set({ status: 'payment_pending', updatedAt: new Date() })
    .where(inArray(campaignInfluencers.id, selectedCiIds));

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    paymentId: payment.id,
    keyId: env.RAZORPAY_KEY_ID,
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

  await sendPaymentNotifications(campaignId, ciIds, paymentType);
  emitToCampaign(campaignId, 'CAMPAIGN_UPDATED', { id: campaignId });
}

export async function verifyCampaignPayment(
  campaignId: string,
  requester: JWTPayload,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
) {
  await assertBrandOwnsCampaign(campaignId, requester);

  if (!env.RAZORPAY_KEY_SECRET) {
    throw new AppError('PAYMENT_CONFIG_MISSING', 'Razorpay secret is not configured');
  }

  const computedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  const providedBuffer = Buffer.from(razorpaySignature);
  const expectedBuffer = Buffer.from(computedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new BadRequestError('Invalid Razorpay signature');
  }

  const [payment] = await db
    .select()
    .from(campaignPayments)
    .where(
      and(
        eq(campaignPayments.razorpayOrderId, razorpayOrderId),
        eq(campaignPayments.campaignId, campaignId)
      )
    )
    .limit(1);

  if (!payment) {
    throw new NotFoundError('Campaign payment record');
  }

  if (payment.status === 'captured') {
    return { message: 'Payment already verified', paymentId: payment.id, status: payment.status };
  }

  if (payment.status !== 'pending') {
    throw new BadRequestError(`Cannot verify payment in "${payment.status}" state`);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(campaignPayments)
      .set({
        status: 'captured',
        razorpayPaymentId,
        capturedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaignPayments.id, payment.id));

    const items = await tx
      .select({ campaignInfluencerId: campaignPaymentItems.campaignInfluencerId })
      .from(campaignPaymentItems)
      .where(eq(campaignPaymentItems.campaignPaymentId, payment.id));

    const selectedCiIds = items.map((i) => i.campaignInfluencerId);
    if (!selectedCiIds.length) return;

    if (payment.paymentType === 'advance') {
      await tx
        .update(campaignInfluencers)
        .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
        .where(inArray(campaignInfluencers.id, selectedCiIds));

      const [campaign] = await tx
        .select({ scriptType: campaigns.scriptType })
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      const nextStatus = campaign?.scriptType === 'creator' ? 'script_pending' : 'work_pending';
      await tx
        .update(campaignInfluencers)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(inArray(campaignInfluencers.id, selectedCiIds));
    } else {
      await tx
        .update(campaignInfluencers)
        .set({
          status: 'completed',
          finalPaidAt: new Date(),
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(campaignInfluencers.id, selectedCiIds));

      // Check if ALL influencers in this campaign are now in a terminal state
      // Terminal states: completed, settled, rejected, withdrawn
      const [remaining] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(campaignInfluencers)
        .where(
          and(
            eq(campaignInfluencers.campaignId, campaignId),
            sql`${campaignInfluencers.status} NOT IN ('completed', 'settled', 'rejected', 'withdrawn')`
          )
        );

      if (remaining.count === 0) {
        // All influencers are done! Auto-complete the campaign
        const [updatedCampaign] = await tx
          .update(campaigns)
          .set({
            status: 'completed',
            updatedAt: new Date(),
          })
          .where(and(eq(campaigns.id, campaignId), sql`${campaigns.status} != 'closed'`))
          .returning();

        if (updatedCampaign) {
          // Notify brand owner about campaign completion
          const [brand] = await tx
            .select({ userId: brandProfiles.userId })
            .from(brandProfiles)
            .where(eq(brandProfiles.id, updatedCampaign.brandId))
            .limit(1);

          if (brand) {
            await createNotification({
              userId: brand.userId,
              type: 'system',
              title: 'Campaign Completed!',
              message: `All influencers have finished their work for "${updatedCampaign.name}". Your campaign is now marked as completed.`,
              campaignId,
              campaignName: updatedCampaign.name,
              actionUrl: `/campaigns/${campaignId}`,
            });
          }
        }
      }
    }
  });

  const items = await db
    .select({ campaignInfluencerId: campaignPaymentItems.campaignInfluencerId })
    .from(campaignPaymentItems)
    .where(eq(campaignPaymentItems.campaignPaymentId, payment.id));
  await sendPaymentNotifications(
    campaignId,
    items.map((i) => i.campaignInfluencerId),
    payment.paymentType as 'advance' | 'final'
  );
  emitToCampaign(campaignId, 'CAMPAIGN_UPDATED', { id: campaignId });

  return { message: 'Payment verified and captured successfully', paymentId: payment.id, status: 'captured' };
}

// ─── Get payment summary for a campaign ──────────────────────────────────────

export async function getCampaignPaymentSummary(campaignId: string, requester: JWTPayload) {
  const campaign = await assertBrandOwnsCampaign(campaignId, requester);

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

export async function getPaymentRoundDetails(campaignId: string, paymentId: string, requester: JWTPayload) {
  await assertBrandOwnsCampaign(campaignId, requester);
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

// ─── Handle payment failure (webhook: payment.failed / order.expired) ────────

export async function handleCampaignPaymentFailure(razorpayOrderId: string) {
  const [payment] = await db
    .select()
    .from(campaignPayments)
    .where(
      and(
        eq(campaignPayments.razorpayOrderId, razorpayOrderId),
        eq(campaignPayments.status, 'pending')
      )
    )
    .limit(1);

  if (!payment) return; // Already handled or not found

  await db.transaction(async (tx) => {
    await tx
      .update(campaignPayments)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(campaignPayments.id, payment.id));

    const items = await tx
      .select({ campaignInfluencerId: campaignPaymentItems.campaignInfluencerId })
      .from(campaignPaymentItems)
      .where(eq(campaignPaymentItems.campaignPaymentId, payment.id));

    const ciIds = items.map((i) => i.campaignInfluencerId);
    if (!ciIds.length) return;

    // Revert only those still in payment_pending (guard against race conditions)
    await tx
      .update(campaignInfluencers)
      .set({ status: 'accepted', updatedAt: new Date() })
      .where(
        and(
          inArray(campaignInfluencers.id, ciIds),
          eq(campaignInfluencers.status, 'payment_pending')
        )
      );
  });
}
