import crypto from 'crypto';
import { env } from '@/config/env';
import { AppError } from '@/shared/errors';
import * as paymentsService from './payments.service';

export async function handleWebhook(payload: any, signature: string) {
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
        throw new AppError('CONFIG_ERROR', 'Razorpay webhook secret not configured');
    }

    // Verify webhook signature
    const expectedSignature = crypto
        .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex');

    // In production, we'd compare expectedSignature and signature more strictly using crypto.timingSafeEqual
    // This is a basic string comparison
    if (signature !== expectedSignature) {
        throw new AppError('INVALID_SIGNATURE', 'Webhook signature mismatch');
    }

    if (payload.event === 'payment.captured' || payload.event === 'order.paid') {
        const entity = payload.payload?.payment?.entity || payload.payload?.order?.entity;
        if (entity && entity.notes) {
            const { campaignInfluencerId, type } = entity.notes;
            if (campaignInfluencerId && type) {
                await paymentsService.handlePaymentSuccess(campaignInfluencerId, type);
            }
        }
    }
}
