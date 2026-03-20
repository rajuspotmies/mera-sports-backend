import { z } from 'zod';

export const initiatePaymentRoundSchema = z.object({
  paymentType: z.enum(['advance', 'final']),
  ciIds: z.array(z.string().uuid()).min(1).optional(),
});

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const webhookSchema = z.object({
  event: z.string(),
  payload: z.any(),
});
