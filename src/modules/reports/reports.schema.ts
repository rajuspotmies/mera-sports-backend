import { z } from 'zod';

export const createReportSchema = z.object({
  targetId: z.string().uuid(),
  targetType: z.enum(['brand', 'influencer']),
  reason: z.enum(['spam', 'harassment', 'inappropriate_content', 'fake_account', 'scam', 'other']),
  description: z.string().max(500).optional(),
  contextType: z.enum(['chat', 'campaign', 'profile']).optional(),
  contextId: z.string().uuid().optional(),
});

export const createBlockSchema = z.object({
  targetId: z.string().uuid(),
  targetType: z.enum(['brand', 'influencer']),
});

export type CreateReportDTO = z.infer<typeof createReportSchema>;
export type CreateBlockDTO = z.infer<typeof createBlockSchema>;
