import { z } from 'zod';

export const initiatePaymentSchema = z.object({
    influencerId: z.string().uuid(),
    type: z.enum(['first', 'final']),
});

export const webhookSchema = z.object({
    event: z.string(),
    payload: z.any(),
});
