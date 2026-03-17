import crypto from 'crypto';
import { env } from '@/config/env';
import { AppError } from '@/shared/errors';
import * as paymentsService from './payments.service';

export async function handleWebhook(payload: any, signature: string, rawBody?: Buffer) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new AppError('CONFIG_ERROR', 'Razorpay webhook secret not configured');
  }

  const hmac = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET);
  const verificationData = rawBody ? rawBody : JSON.stringify(payload);
  hmac.update(verificationData);

  const expectedSignature = hmac.digest('hex');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new AppError('INVALID_SIGNATURE', 'Webhook signature mismatch');
  }

  if (payload.event === 'payment.captured' || payload.event === 'order.paid') {
    const entity = payload.payload?.payment?.entity || payload.payload?.order?.entity;
    if (entity && entity.notes) {
      const { campaignId, round, paymentType } = entity.notes;
      if (campaignId && round && paymentType) {
        await paymentsService.handleCampaignPaymentSuccess(
          campaignId,
          Number(round),
          paymentType,
          entity.id
        );
      }
    }
  }
}
