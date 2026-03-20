import { z } from 'zod';

export const initiatePaymentRoundSchema = z.object({
  paymentType: z.enum(['advance', 'final']),
  ciIds: z.array(z.string()).optional(), // Optional: if provided, only pay for these selections
});

export const webhookSchema = z.object({
  event: z.string(),
  payload: z.any(),
});

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});
