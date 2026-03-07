import Razorpay from 'razorpay';
import { env } from '@/config/env';
import { db } from '@/db';
import { campaignInfluencers, payments, influencerProfiles, campaigns, brandProfiles } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { AppError } from '@/shared/errors';
import { createNotification } from '../notifications/notifications.service';

// Lazy init so it doesn't crash if keys are missing
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

export async function initiatePayment(campaignId: string, influencerId: string, type: 'first' | 'final') {
    const [ci] = await db.select().from(campaignInfluencers)
        .where(and(
            eq(campaignInfluencers.campaignId, campaignId),
            eq(campaignInfluencers.influencerId, influencerId)
        ));

    if (!ci) {
        throw new AppError('NOT_FOUND', 'Campaign influencer not found', 404);
    }

    if (type === 'first' && ci.status !== 'payment_pending') {
        throw new AppError('INVALID_STATE', 'Negotiation must be resolved before payment');
    }

    // Create or get payment row
    let [payment] = await db.select().from(payments)
        .where(eq(payments.campaignInfluencerId, ci.id));

    if (!payment) {
        [payment] = await db.insert(payments).values({
            campaignInfluencerId: ci.id,
            firstAmount: ci.firstPayment,
            finalAmount: ci.finalPayment,
            status: 'pending_first',
        }).returning();
    }

    const amount = type === 'first' ? payment.firstAmount : payment.finalAmount;

    if (!amount || Number(amount) <= 0) {
        throw new AppError('INVALID_AMOUNT', 'Payment amount must be greater than 0');
    }

    const rzp = getRazorpay();
    const order = await rzp.orders.create({
        amount: Math.round(Number(amount) * 100),  // Razorpay expects paise
        currency: payment.currency ?? 'INR',
        receipt: `${type}_${ci.id}`,
        notes: { campaignInfluencerId: ci.id, type, paymentId: payment.id },
    });

    return { orderId: order.id, amount: order.amount, currency: order.currency };
}

export async function getPaymentStatus(campaignId: string) {
    const list = await db.select({
        influencerId: campaignInfluencers.influencerId,
        status: payments.status,
    }).from(payments)
        .innerJoin(campaignInfluencers, eq(payments.campaignInfluencerId, campaignInfluencers.id))
        .where(eq(campaignInfluencers.campaignId, campaignId));

    return list;
}

export async function handlePaymentSuccess(campaignInfluencerId: string, type: 'first' | 'final') {
    const [ciData] = await db
        .select({
            ci: campaignInfluencers,
            influencerUserId: influencerProfiles.userId,
            brandUserId: brandProfiles.userId,
            campaignName: campaigns.name,
        })
        .from(campaignInfluencers)
        .innerJoin(influencerProfiles, eq(influencerProfiles.id, campaignInfluencers.influencerId))
        .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
        .innerJoin(brandProfiles, eq(brandProfiles.id, campaigns.brandId))
        .where(eq(campaignInfluencers.id, campaignInfluencerId))
        .limit(1);

    if (!ciData) return;
    const { ci, influencerUserId, brandUserId, campaignName } = ciData;

    if (type === 'first') {
        await db.update(payments)
            .set({ status: 'first_paid', firstPaidAt: new Date() })
            .where(eq(payments.campaignInfluencerId, campaignInfluencerId));

        await db.update(campaignInfluencers)
            .set({ status: 'paid', paidAt: new Date() })
            .where(eq(campaignInfluencers.id, campaignInfluencerId));

        // Notify Influencer
        await createNotification({
            userId: influencerUserId,
            type: 'system',
            title: 'Payment Received',
            message: `The first payment for "${campaignName}" has been received. You can now start scripting!`,
            campaignId: ci.campaignId,
            campaignName: campaignName,
            actionUrl: `/campaigns/${ci.campaignId}`,
        });

        // Notify Brand
        await createNotification({
            userId: brandUserId,
            type: 'system',
            title: 'Payment Successful',
            message: `Your first payment for campaign "${campaignName}" was processed successfully.`,
            campaignId: ci.campaignId,
            campaignName: campaignName,
            actionUrl: `/campaigns/${ci.campaignId}`,
        });
    } else {
        await db.update(payments)
            .set({ status: 'completed', finalPaidAt: new Date() })
            .where(eq(payments.campaignInfluencerId, campaignInfluencerId));

        await db.update(campaignInfluencers)
            .set({ status: 'completed', completedAt: new Date() })
            .where(eq(campaignInfluencers.id, campaignInfluencerId));

        // Notify Influencer
        await createNotification({
            userId: influencerUserId,
            type: 'system',
            title: 'Final Payment Received',
            message: `The final payment for "${campaignName}" has been received. Great job!`,
            campaignId: ci.campaignId,
            campaignName: campaignName,
            actionUrl: `/campaigns/${ci.campaignId}`,
        });

        // Notify Brand
        await createNotification({
            userId: brandUserId,
            type: 'system',
            title: 'Final Payment Successful',
            message: `The final payment for campaign "${campaignName}" was processed successfully. The collaboration is now complete.`,
            campaignId: ci.campaignId,
            campaignName: campaignName,
            actionUrl: `/campaigns/${ci.campaignId}`,
        });
    }
}
