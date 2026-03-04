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
  status: z.enum(['draft', 'active']).optional(),

  // Old flat structure
  budgetMode: z.enum(['paid', 'product', 'paid_product']).optional(),
  budgetTierPricing: z.array(tierPricingSchema).default([]),
  budgetTotal: z.coerce.number().min(0).optional(),
  platformFeePercent: z.coerce.number().min(0).max(100).optional(),

  // Details
  location: z.string().max(255).optional(),
  productLocation: z.string().max(255).optional(),
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

  deadline: z.string().optional(),

  // Optional Frontend Nested Payload Structure
  budget: z.object({
    mode: z.enum(['paid', 'product', 'paid_product']).optional(),
    total: z.coerce.number().min(0).optional(),
    platformFeePercent: z.coerce.number().min(0).max(100).optional(),
    tierPricing: z.array(
      z.object({
        tier: z.enum(['nano', 'micro', 'mid', 'macro', 'mega']),
        amount: z.coerce.number().min(0),
      })
    ).optional(),
    strategy: z.string().optional(),
    mixMode: z.boolean().optional(),
    selectedTier: z.string().optional(),
    creatorSizes: z.array(z.enum(['nano', 'micro', 'mid', 'macro', 'mega'])).optional(),
    productDetails: z.string().optional(),
  }).optional(),

  requirements: z.object({
    platform: z.string().optional(),
    contentTypes: z.array(z.string()).optional(),
    postingType: z.string().optional(),
    brandGuidelines: z.string().optional(),
    references: z.string().optional(),
    scriptType: z.string().optional(),
  }).optional(),

  timeline: z.object({
    applicationDeadline: z.string().optional(),
    scriptDeadline: z.string().optional(),
    workDeadline: z.string().optional(),
  }).optional(),
}).refine((data) => data.budgetMode || data.budget?.mode, {
  message: "budget Mode is required",
  path: ["budgetMode"]
});

export const updateCampaignSchema = createCampaignSchema;
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
