import { z } from 'zod';

export const initiatePaymentRoundSchema = z.object({
  paymentType: z.enum(['advance', 'final']),
  ciIds: z.array(z.string().uuid()).min(1).optional(),
});

export const verifyPaymentSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
});

export const cancelPaymentSchema = z.object({
  paymentId: z.string().uuid(),
});

export const webhookSchema = z.object({
  event: z.string(),
  payload: z.any(),
});
