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

export async function getPaymentSummaryHandler(req: Request, res: Response) {
  const { campaignId } = req.params;
  const result = await paymentsService.getCampaignPaymentSummary(campaignId, req.user);
  sendSuccess(res, result);
}

export async function getPaymentRoundHandler(req: Request, res: Response) {
  const { campaignId, paymentId } = req.params;
  const result = await paymentsService.getPaymentRoundDetails(campaignId, paymentId);
  sendSuccess(res, result);
}

export async function verifyPaymentHandler(req: Request, res: Response) {
  const { campaignId } = req.params;
  const result = await paymentsService.verifyPayment(campaignId, req.body, req.user);
  sendSuccess(res, result);
}

export async function razorpayWebhookHandler(req: Request, res: Response) {
  const signature = req.headers['x-razorpay-signature'] as string;

  if (!signature) {
    throw new AppError('MISSING_SIGNATURE', 'Razorpay signature is missing', 400);
  }

  await handleWebhook(req.body, signature, req.rawBody);
  res.json({ status: 'ok' });
}
