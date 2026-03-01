import { z } from 'zod';

const tierPricingSchema = z.object({
  tier: z.enum(['nano', 'micro', 'mid', 'macro', 'mega']),
  rate: z.number().min(0),
});

const deliverableSchema = z.object({
  type: z.string(),
  count: z.number().int().min(1),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['influencer', 'ugc', 'meme', 'twitter']),
  visibility: z.enum(['private', 'public']).default('private'),
  objective: z.string().max(100).optional(),

  // Budget
  budgetMode: z.enum(['paid', 'product', 'paid_product']),
  budgetTierPricing: z.array(tierPricingSchema).default([]),
  budgetTotal: z.number().min(0).optional(),
  platformFeePercent: z.number().min(0).max(100).optional(),

  // Details
  location: z.string().max(255).optional(),
  niches: z.array(z.string()).default([]),
  creatorSizes: z.array(z.enum(['nano', 'micro', 'mid', 'macro', 'mega'])).default([]),

  // Creative
  brief: z.string().max(5000).optional(),
  dos: z.array(z.string()).default([]),
  donts: z.array(z.string()).default([]),
  referenceUrls: z.array(z.string().url()).default([]),
  hashtags: z.array(z.string()).default([]),
  deliverables: z.array(deliverableSchema).default([]),
  proofOfWorkReq: z.boolean().default(false),

  deadline: z.string().datetime().optional(),
});

export const updateCampaignSchema = createCampaignSchema.partial();

export const listCampaignsQuerySchema = z.object({
  status: z
    .enum(['draft', 'active', 'script', 'work', 'completed', 'closed', 'withdrawn'])
    .optional(),
  type: z.enum(['influencer', 'ugc', 'meme', 'twitter']).optional(),
  visibility: z.enum(['private', 'public']).optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  sort: z.enum(['createdAt', 'deadline', 'progress']).default('createdAt'),
});

export type CreateCampaignDTO = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignDTO = z.infer<typeof updateCampaignSchema>;
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;
