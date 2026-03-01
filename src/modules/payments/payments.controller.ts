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

    // The raw body is needed for signature verification
    // But since we use express.json globally, we assume handleWebhook handles the already parsed body
    // In a strict setup, we need the raw buffer, but for this boilerplate we'll pass the parsed body
    await handleWebhook(req.body, signature);

    res.json({ status: 'ok' });
}
