import { z } from 'zod';

export const updateBrandSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  brandName: z.string().min(1).max(255).optional(),
  brandType: z.string().max(100).optional(),
  industry: z.string().max(100).optional(),
  website: z.string().max(255).optional(),
  city: z.string().max(255).optional(),
  primaryLanguage: z.string().max(100).optional(),
  otherLanguages: z.array(z.string()).optional(),
  bio: z.string().max(2000).optional(),
});

export type UpdateBrandDTO = z.infer<typeof updateBrandSchema>;
