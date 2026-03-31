import { Request, Response } from 'express';
import * as paymentsService from './payments.service';
import { handleWebhook } from './webhooks';
import { AppError } from '@/shared/errors';
import { sendSuccess } from '@/shared/utils/response';

export async function initiatePaymentRoundHandler(req: Request, res: Response) {
  const { campaignId } = req.params;
  const { paymentType, ciIds } = req.body;

  const result = await paymentsService.initiatePaymentRound(campaignId, req.user, paymentType, ciIds);
  sendSuccess(res, result, 201);
}

export async function verifyPaymentHandler(req: Request, res: Response) {
  const { campaignId } = req.params;
  const { orderId, paymentId } = req.body;

  const result = await paymentsService.verifyCampaignPayment(
    campaignId,
    req.user,
    orderId,
    paymentId
  );
  sendSuccess(res, result, 201);
}

export async function cancelPaymentHandler(req: Request, res: Response) {
  const { paymentId } = req.params;
  const result = await paymentsService.cancelPaymentRound(paymentId, req.user);
  sendSuccess(res, result);
}

export async function getPaymentSummaryHandler(req: Request, res: Response) {
  const { campaignId } = req.params;
  const result = await paymentsService.getCampaignPaymentSummary(campaignId, req.user);
  sendSuccess(res, result);
}

export async function getPaymentRoundHandler(req: Request, res: Response) {
  const { campaignId, paymentId } = req.params;
  const result = await paymentsService.getPaymentRoundDetails(campaignId, paymentId, req.user);
  sendSuccess(res, result);
}

export async function cashfreeWebhookHandler(req: Request, res: Response) {
  const signature = req.headers['x-webhook-signature'] as string;
  const timestamp = req.headers['x-webhook-timestamp'] as string;

  if (!signature || !timestamp) {
    throw new AppError('MISSING_SIGNATURE', 'Cashfree signature or timestamp is missing', 400);
  }

  const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
  await handleWebhook(req.body, signature, timestamp, rawBody);
  res.json({ status: 'ok' });
}
