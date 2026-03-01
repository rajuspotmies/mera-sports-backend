import { z } from 'zod';

export const updateBrandSchema = z.object({
  brandName: z.string().min(1).max(255).optional(),
  industry: z.string().max(100).optional(),
  website: z.string().url().optional().or(z.literal('')),
  description: z.string().max(2000).optional(),
});

export type UpdateBrandDTO = z.infer<typeof updateBrandSchema>;
