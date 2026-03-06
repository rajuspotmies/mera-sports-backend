import crypto from 'crypto';
import { env } from '@/config/env';
import { AppError } from '@/shared/errors';
import * as paymentsService from './payments.service';

export async function handleWebhook(payload: any, signature: string, rawBody?: Buffer) {
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
        throw new AppError('CONFIG_ERROR', 'Razorpay webhook secret not configured');
    }

    // Verify webhook signature
    const hmac = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET);

    // Use rawBody for verification if available, otherwise stringify payload (less secure but fallback)
    const verificationData = rawBody ? rawBody : JSON.stringify(payload);
    hmac.update(verificationData);

    const expectedSignature = hmac.digest('hex');

    // Secure comparison using timingSafeEqual to prevent timing attacks
    // Strings must be converted to Buffers of the same length
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
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
