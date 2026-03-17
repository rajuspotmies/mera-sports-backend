import { z } from 'zod';

export const initiatePaymentRoundSchema = z.object({
  paymentType: z.enum(['advance', 'final']),
});

export const webhookSchema = z.object({
  event: z.string(),
  payload: z.any(),
});
