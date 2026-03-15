import { z } from 'zod';

export const applyToCampaignSchema = z.object({
  note: z.string().max(500).optional(),
  /** For public single-tier campaigns: influencer's quoted amount. Ignored for multi-tier. */
  amount: z.number().positive().optional(),
  /** Alias for amount (frontend may send either). */
  proposedBudget: z.number().positive().optional(),
});

export const listApplicationsQuerySchema = z.object({
  status: z
    .enum([
      'invited',
      'applied',
      'negotiating',
      'accepted',
      'payment_pending',
      'paid',
      'script_pending',
      'script_review',
      'work_pending',
      'work_review',
      'completed',
      'rejected',
      'withdrawn',
    ])
    .optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});

export type ApplyToCampaignDTO = z.infer<typeof applyToCampaignSchema>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsQuerySchema>;
