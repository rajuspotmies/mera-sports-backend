import crypto from 'crypto';
import { env } from '@/config/env';
import { AppError } from '@/shared/errors';
import * as paymentsService from './payments.service';

export async function handleWebhook(payload: any, signature: string, timestamp: string, rawBody?: string) {
  if (!env.CASHFREE_WEBHOOK_SECRET) {
    throw new AppError('CONFIG_ERROR', 'Cashfree webhook secret not configured');
  }

  // Cashfree webhook verification: HMAC-SHA256(timestamp + rawBody, secret) → base64
  const message = timestamp + (rawBody ?? JSON.stringify(payload));
  const expectedSignature = crypto
    .createHmac('sha256', env.CASHFREE_WEBHOOK_SECRET)
    .update(message)
    .digest('base64');

  if (signature !== expectedSignature) {
    throw new AppError('INVALID_SIGNATURE', 'Webhook signature mismatch');
  }

  const eventType: string = payload?.type ?? payload?.event ?? '';

  // Cashfree sends: PAYMENT_SUCCESS_WEBHOOK, PAYMENT_FAILED_WEBHOOK, ORDER_PAID
  if (
    eventType === 'PAYMENT_SUCCESS_WEBHOOK' ||
    eventType === 'ORDER_PAID' ||
    eventType === 'payment.captured'
  ) {
    const orderId =
      payload?.data?.order?.order_id ??
      payload?.data?.payment?.order_id ??
      payload?.payload?.payment?.entity?.order_id;

    const cfPaymentId =
      payload?.data?.payment?.cf_payment_id?.toString() ??
      payload?.data?.payment?.payment_id?.toString();

    if (orderId) {
      await paymentsService.handleCampaignPaymentSuccess(orderId, cfPaymentId);
    }
  }

  if (
    eventType === 'PAYMENT_FAILED_WEBHOOK' ||
    eventType === 'payment.failed' ||
    eventType === 'ORDER_EXPIRED'
  ) {
    const orderId =
      payload?.data?.order?.order_id ??
      payload?.data?.payment?.order_id ??
      payload?.payload?.payment?.entity?.order_id;

    if (orderId) {
      await paymentsService.handleCampaignPaymentFailure(orderId);
    }
  }
}
