import { z } from 'zod';

export const counterOfferSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  note: z.string().max(500).optional(),
});

export const acceptOfferSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
});

export type CounterOfferDTO = z.infer<typeof counterOfferSchema>;
export type AcceptOfferDTO = z.infer<typeof acceptOfferSchema>;
