import { Cashfree, CFEnvironment } from 'cashfree-pg';
import type { CreateOrderRequest } from 'cashfree-pg';
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

// ─── Cashfree SDK singleton ───────────────────────────────────────────────────

let _cashfree: InstanceType<typeof Cashfree> | null = null;

function getCashfree(): InstanceType<typeof Cashfree> {
  if (!_cashfree) {
    if (!env.CASHFREE_APP_ID || !env.CASHFREE_SECRET_KEY) {
      throw new AppError('PAYMENT_CONFIG_MISSING', 'Cashfree credentials are not configured');
    }
    const cfEnv = env.CASHFREE_ENV === 'production' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
    _cashfree = new Cashfree(cfEnv, env.CASHFREE_APP_ID, env.CASHFREE_SECRET_KEY);
  }
  return _cashfree;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function advanceCIsAfterPayment(ciIds: string[], campaignId: string, txDB: any = db) {
  const [campaign] = await txDB
    .select({ scriptType: campaigns.scriptType, budgetMode: campaigns.budgetMode })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  let nextStatus = campaign?.scriptType === 'creator' ? 'script_pending' : 'work_pending';
  
  // If the campaign sends a product, intercept the flow and await product delivery
  if (campaign?.budgetMode === 'product' || campaign?.budgetMode === 'paid_product') {
    nextStatus = 'product_pending';
  }

  await txDB
    .update(campaignInfluencers)
    .set({ status: nextStatus as any, updatedAt: new Date() })
    .where(inArray(campaignInfluencers.id, ciIds));
}

async function sendPaymentNotifications(
  campaignId: string,
  ciIds: string[],
  paymentType: 'advance' | 'final'
) {
  if (!ciIds.length) return;

  const ciDetails = await db
    .select({ influencerUserId: influencerProfiles.userId })
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
    await createNotification({
      userId: ci.influencerUserId,
      type: 'payment',
      title: paymentType === 'advance' ? 'Payment Received' : 'Final Payment Received',
      message:
        paymentType === 'advance'
          ? `The advance payment for "${campaignName}" has been received. You can now start working!`
          : `The final payment for "${campaignName}" has been received. Great job!`,
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
    await createNotification({
      userId: brandData.brandUserId,
      type: 'payment',
      title: paymentType === 'advance' ? 'Payment Successful' : 'Final Payment Successful',
      message:
        paymentType === 'advance'
          ? `Your advance payment for campaign "${campaignName}" (${ciIds.length} influencer(s)) was processed successfully.`
          : `Your final payment for campaign "${campaignName}" was processed successfully. Work is complete.`,
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

// ─── Initiate a payment round ─────────────────────────────────────────────────

export async function initiatePaymentRound(
  campaignId: string,
  brandUser: JWTPayload,
  paymentType: 'advance' | 'final',
  ciIds?: string[]
) {
  const campaign = await assertBrandOwnsCampaign(campaignId, brandUser);

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
        ? 'No eligible accepted influencers found for payment.'
        : 'No eligible work_review influencers found for payment.'
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
    const payableAmount = budget * 0.5; // 50% per round
    influencerBudgetTotal += payableAmount;
    itemsToCreate.push({ ciId: ci.id, budget: payableAmount });
  }

  const feePercent = Number(campaign.platformFeePercent ?? 10);
  const platformFeeAmount = (influencerBudgetTotal * feePercent) / 100;
  const totalAmount = influencerBudgetTotal + platformFeeAmount;

  if (totalAmount <= 0) throw new BadRequestError('Payment amount must be greater than 0');

  // Determine round number
  const [lastPayment] = await db
    .select({ round: campaignPayments.round })
    .from(campaignPayments)
    .where(eq(campaignPayments.campaignId, campaignId))
    .orderBy(sql`${campaignPayments.round} DESC`)
    .limit(1);

  const round = (lastPayment?.round ?? 0) + 1;

  // ── Create Cashfree order ──
  const cf = getCashfree();

  const cfOrderId = `mt_r${round}_${paymentType}_${campaignId.replace(/-/g, '').slice(0, 10)}_${Date.now()}`;

  const orderRequest = {
    order_id: cfOrderId,
    order_amount: Number(totalAmount.toFixed(2)),
    order_currency: 'INR',
    customer_details: {
      customer_id: brandUser.sub,
      customer_phone: env.CASHFREE_DEFAULT_PHONE ?? '9999999999',
      customer_name: 'Brand Owner',
    },
    order_meta: {
      return_url: `${env.FRONTEND_URLS?.[0] ?? 'http://localhost:5173'}/campaigns/${campaignId}?tab=applications&payment=done`,
      notify_url: `${env.BACKEND_URL ?? 'http://localhost:3000'}/api/v1/payments/webhook/cashfree`,
    },
    order_note: JSON.stringify({ campaignId, round, paymentType }),
  };

  const cfResponse = await cf.PGCreateOrder(orderRequest as unknown as CreateOrderRequest);
  const cfOrder = cfResponse.data as any;

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
      razorpayOrderId: cfOrderId, // reuse column to store Cashfree order ID
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
    orderId: cfOrderId,
    paymentSessionId: cfOrder.payment_session_id,
    amount: totalAmount,
    currency: 'INR',
    paymentId: payment.id,
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

// ─── Verify payment (client-side callback) ────────────────────────────────────

export async function verifyCampaignPayment(
  campaignId: string,
  requester: JWTPayload,
  orderId: string,
  paymentId: string
) {
  await assertBrandOwnsCampaign(campaignId, requester);

  // Fetch order status from Cashfree
  const cf = getCashfree();
  const cfResponse = await cf.PGFetchOrder(orderId);
  const cfOrder = cfResponse.data as any;

  if (cfOrder.order_status !== 'PAID') {
    throw new BadRequestError(
      `Payment not yet captured. Current status: ${cfOrder.order_status}`
    );
  }

  const [payment] = await db
    .select()
    .from(campaignPayments)
    .where(
      and(
        eq(campaignPayments.razorpayOrderId, orderId), // column stores CF order ID
        eq(campaignPayments.campaignId, campaignId)
      )
    )
    .limit(1);

  if (!payment) throw new NotFoundError('Campaign payment record');

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
        razorpayPaymentId: paymentId,
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

      // Use the centralized advance function which correctly handles:
      // - product/paid_product → product_pending
      // - brand-script campaigns → work_pending
      // - creator-script campaigns → script_pending
      await advanceCIsAfterPayment(selectedCiIds, campaignId, tx);
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

      // Auto-complete campaign if all influencers done
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
        const [updatedCampaign] = await tx
          .update(campaigns)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(and(eq(campaigns.id, campaignId), sql`${campaigns.status} != 'closed'`))
          .returning();

        if (updatedCampaign) {
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

// ─── Cancel payment round (user closed modal mid-payment) ─────────────────────

export async function cancelPaymentRound(
  paymentId: string,
  brandUser: JWTPayload
) {
  // Load the payment record
  const [payment] = await db
    .select()
    .from(campaignPayments)
    .where(eq(campaignPayments.id, paymentId))
    .limit(1);

  if (!payment) throw new NotFoundError('Payment round');
  if (payment.status !== 'pending') {
    // Already captured or already failed — nothing to roll back
    return { message: `Payment is already in "${payment.status}" state, no rollback needed.` };
  }

  await assertBrandOwnsCampaign(payment.campaignId, brandUser);

  await db.transaction(async (tx) => {
    // Mark the payment record as failed
    await tx
      .update(campaignPayments)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(campaignPayments.id, paymentId));

    // Get the CI IDs tied to this payment round
    const items = await tx
      .select({ campaignInfluencerId: campaignPaymentItems.campaignInfluencerId })
      .from(campaignPaymentItems)
      .where(eq(campaignPaymentItems.campaignPaymentId, paymentId));

    const ciIds = items.map((i) => i.campaignInfluencerId);
    if (!ciIds.length) return;

    // Determine rollback status based on payment type
    const rollbackStatus = payment.paymentType === 'advance' ? 'accepted' : 'work_review';

    // Roll back only CIs still stuck at payment_pending
    await tx
      .update(campaignInfluencers)
      .set({ status: rollbackStatus, updatedAt: new Date() })
      .where(
        and(
          inArray(campaignInfluencers.id, ciIds),
          eq(campaignInfluencers.status, 'payment_pending')
        )
      );
  });

  emitToCampaign(payment.campaignId, 'CAMPAIGN_UPDATED', { id: payment.campaignId });

  return { message: 'Payment cancelled and influencer statuses reverted to their previous state.' };
}

// ─── Webhook: Cashfree confirms payment ──────────────────────────────────────

export async function handleCampaignPaymentSuccess(
  cfOrderId: string,
  cfPaymentId?: string
) {
  // Try to find a pending payment first (normal case)
  let [payment] = await db
    .select()
    .from(campaignPayments)
    .where(
      and(
        eq(campaignPayments.razorpayOrderId, cfOrderId), // column stores CF order ID
        eq(campaignPayments.status, 'pending')
      )
    )
    .limit(1);

  // If not found as pending, check if it's already captured but influencers are still stuck
  // (happens when verify succeeded for the payment record but the CI update failed mid-transaction)
  if (!payment) {
    const [capturedPayment] = await db
      .select()
      .from(campaignPayments)
      .where(eq(campaignPayments.razorpayOrderId, cfOrderId))
      .limit(1);

    if (!capturedPayment || capturedPayment.status !== 'captured') return;

    // Check if any influencers are still stuck at payment_pending for this payment round
    const items = await db
      .select({ campaignInfluencerId: campaignPaymentItems.campaignInfluencerId })
      .from(campaignPaymentItems)
      .where(eq(campaignPaymentItems.campaignPaymentId, capturedPayment.id));

    const ciIds = items.map((i) => i.campaignInfluencerId);
    if (ciIds.length === 0) return;

    const stuckCIs = await db
      .select({ id: campaignInfluencers.id })
      .from(campaignInfluencers)
      .where(
        and(
          inArray(campaignInfluencers.id, ciIds),
          eq(campaignInfluencers.status, 'payment_pending')
        )
      );

    if (stuckCIs.length === 0) return; // Already correctly advanced — nothing to do

    // Reconcile: advance the stuck influencers
    const stuckIds = stuckCIs.map((c) => c.id);
    if (capturedPayment.paymentType === 'advance') {
      await db
        .update(campaignInfluencers)
        .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
        .where(inArray(campaignInfluencers.id, stuckIds));
      await advanceCIsAfterPayment(stuckIds, capturedPayment.campaignId);
    } else {
      await db
        .update(campaignInfluencers)
        .set({ status: 'completed', finalPaidAt: new Date(), completedAt: new Date(), updatedAt: new Date() })
        .where(inArray(campaignInfluencers.id, stuckIds));
    }
    emitToCampaign(capturedPayment.campaignId, 'CAMPAIGN_UPDATED', { id: capturedPayment.campaignId });
    return;
  }

  // Normal path: payment was pending — mark captured and advance influencers
  await db
    .update(campaignPayments)
    .set({
      status: 'captured',
      razorpayPaymentId: cfPaymentId ?? null,
      capturedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(campaignPayments.id, payment.id));

  const items = await db
    .select({ campaignInfluencerId: campaignPaymentItems.campaignInfluencerId })
    .from(campaignPaymentItems)
    .where(eq(campaignPaymentItems.campaignPaymentId, payment.id));

  const ciIds = items.map((i) => i.campaignInfluencerId);
  if (ciIds.length === 0) return;

  if (payment.paymentType === 'advance') {
    await db
      .update(campaignInfluencers)
      .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
      .where(inArray(campaignInfluencers.id, ciIds));

    await advanceCIsAfterPayment(ciIds, payment.campaignId);
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

  await sendPaymentNotifications(payment.campaignId, ciIds, payment.paymentType as 'advance' | 'final');
  emitToCampaign(payment.campaignId, 'CAMPAIGN_UPDATED', { id: payment.campaignId });
}

// ─── Webhook: Cashfree payment failed / expired ───────────────────────────────

export async function handleCampaignPaymentFailure(cfOrderId: string) {
  const [payment] = await db
    .select()
    .from(campaignPayments)
    .where(
      and(
        eq(campaignPayments.razorpayOrderId, cfOrderId),
        eq(campaignPayments.status, 'pending')
      )
    )
    .limit(1);

  if (!payment) return;

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

    const rollbackStatus = payment.paymentType === 'advance' ? 'accepted' : 'work_review';

    await tx
      .update(campaignInfluencers)
      .set({ status: rollbackStatus, updatedAt: new Date() })
      .where(
        and(
          inArray(campaignInfluencers.id, ciIds),
          eq(campaignInfluencers.status, 'payment_pending')
        )
      );
  });

  emitToCampaign(payment.campaignId, 'CAMPAIGN_UPDATED', { id: payment.campaignId });
}

// ─── Get payment summary ──────────────────────────────────────────────────────

export async function getCampaignPaymentSummary(campaignId: string, requester: JWTPayload) {
  const campaign = await assertBrandOwnsCampaign(campaignId, requester);

  const paymentRounds = await db
    .select()
    .from(campaignPayments)
    .where(eq(campaignPayments.campaignId, campaignId))
    .orderBy(sql`${campaignPayments.round} ASC`);

  const ciCounts = await db
    .select({ status: campaignInfluencers.status, count: sql<number>`count(*)::int` })
    .from(campaignInfluencers)
    .where(eq(campaignInfluencers.campaignId, campaignId))
    .groupBy(campaignInfluencers.status);

  const statusMap = Object.fromEntries(ciCounts.map((c) => [c.status, c.count]));

  const [unpaidAccepted] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalBudget: sql<number>`coalesce(sum(coalesce(agreed_budget, tier_rate, 0)::numeric), 0)::float`,
    })
    .from(campaignInfluencers)
    .where(
      and(eq(campaignInfluencers.campaignId, campaignId), eq(campaignInfluencers.status, 'accepted'))
    );

  const [unpaidFinal] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalBudget: sql<number>`coalesce(sum(coalesce(agreed_budget, tier_rate, 0)::numeric), 0)::float`,
    })
    .from(campaignInfluencers)
    .where(
      and(eq(campaignInfluencers.campaignId, campaignId), eq(campaignInfluencers.status, 'work_review'))
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

// ─── Get payment round details ────────────────────────────────────────────────

export async function getPaymentRoundDetails(
  campaignId: string,
  paymentId: string,
  requester: JWTPayload
) {
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
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
    .where(eq(campaignPaymentItems.campaignPaymentId, paymentId));

  return { payment, items };
}

// ─── Reconcile stuck influencers for a campaign ───────────────────────────────
// Fixes the case where campaign_payment.status = 'captured' but the
// linked influencers are still stuck at 'payment_pending' due to a
// partial failure (timing issue between verify call and DB transaction).

export async function reconcileStuckInfluencers(
  campaignId: string,
  requester: JWTPayload
) {
  await assertBrandOwnsCampaign(campaignId, requester);

  // Find all captured payments for this campaign
  const capturedPayments = await db
    .select()
    .from(campaignPayments)
    .where(
      and(
        eq(campaignPayments.campaignId, campaignId),
        eq(campaignPayments.status, 'captured')
      )
    );

  if (capturedPayments.length === 0) {
    return { fixed: 0, message: 'No captured payments found for this campaign.' };
  }

  let totalFixed = 0;

  for (const payment of capturedPayments) {
    // Get all influencer IDs tied to this payment round
    const items = await db
      .select({ campaignInfluencerId: campaignPaymentItems.campaignInfluencerId })
      .from(campaignPaymentItems)
      .where(eq(campaignPaymentItems.campaignPaymentId, payment.id));

    const ciIds = items.map((i) => i.campaignInfluencerId);
    if (ciIds.length === 0) continue;

    // Find influencers that are still stuck at payment_pending
    const stuckCIs = await db
      .select({ id: campaignInfluencers.id })
      .from(campaignInfluencers)
      .where(
        and(
          inArray(campaignInfluencers.id, ciIds),
          eq(campaignInfluencers.status, 'payment_pending')
        )
      );

    if (stuckCIs.length === 0) continue;

    const stuckIds = stuckCIs.map((c) => c.id);

    if (payment.paymentType === 'advance') {
      await db
        .update(campaignInfluencers)
        .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
        .where(inArray(campaignInfluencers.id, stuckIds));
      await advanceCIsAfterPayment(stuckIds, campaignId);
    } else {
      await db
        .update(campaignInfluencers)
        .set({
          status: 'completed',
          finalPaidAt: new Date(),
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(campaignInfluencers.id, stuckIds));
    }

    totalFixed += stuckIds.length;
  }

  emitToCampaign(campaignId, 'CAMPAIGN_UPDATED', { id: campaignId });

  return {
    fixed: totalFixed,
    message: totalFixed > 0
      ? `Reconciled ${totalFixed} stuck influencer(s) to their correct post-payment status.`
      : 'All influencers are already in the correct state.',
  };
}
