import { z } from 'zod';

const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const upsertBankDetailsSchema = z.object({
  accountHolderName: z.string().min(1).max(255),
  accountNumber:     z.string().min(5).max(20),
  ifscCode:          z.string().regex(ifscRegex, 'Invalid IFSC code (format: ABCD0123456)'),
  bankName:          z.string().max(255).optional(),
  upiId:             z.string().max(100).optional(),
});

export type UpsertBankDetailsDTO = z.infer<typeof upsertBankDetailsSchema>;
