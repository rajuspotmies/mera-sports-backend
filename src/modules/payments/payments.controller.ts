import { Request, Response } from 'express';
import * as paymentsService from './payments.service';
import { handleWebhook } from './webhooks';
import { AppError } from '@/shared/errors';

export async function initiatePaymentHandler(req: Request, res: Response) {
    const { campaignId } = req.params;
    const { influencerId, type } = req.body;

    if (!influencerId || !type) {
        throw new AppError('INVALID_INPUT', 'influencerId and type are required');
    }

    const result = await paymentsService.initiatePayment(campaignId, influencerId, type);
    res.json({ success: true, data: result });
}

export async function getPaymentStatusHandler(req: Request, res: Response) {
    const { campaignId } = req.params;
    const result = await paymentsService.getPaymentStatus(campaignId);
    res.json({ success: true, data: result });
}

export async function razorpayWebhookHandler(req: Request, res: Response) {
    const signature = req.headers['x-razorpay-signature'] as string;

    if (!signature) {
        throw new AppError('MISSING_SIGNATURE', 'Razorpay signature is missing', 400);
    }

    // Use rawBody for secure signature verification if available
    await handleWebhook(req.body, signature, req.rawBody);

    res.json({ status: 'ok' });
}
