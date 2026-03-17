import { z } from 'zod';

export const settleInfluencerSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(['bank_transfer', 'upi', 'other']),
  reference: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
});

export const listSettlementsQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
});

export type SettleInfluencerDTO = z.infer<typeof settleInfluencerSchema>;
