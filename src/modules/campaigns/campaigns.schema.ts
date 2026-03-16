import { z } from 'zod';

const tierEnum = z.enum(['nano', 'micro', 'mid', 'macro', 'mega']);

const tierConfigSchema = z.object({
  tier: tierEnum,
  count: z.coerce.number().int().min(1),
  amount: z.coerce.number().min(0),
});

const basicsSchema = z.object({
  campaignName: z.string().min(1).max(255),
  // Do not restrict coverImageUrl length; it can be a full URL or uploads key
  coverImageUrl: z.string(),
  type: z.enum(['influencer', 'ugc', 'meme', 'twitter']),
  niche: z.string().min(1),
  visibility: z.enum(['public', 'private']).default('public'),
  objective: z.string().min(1),
  location: z.string().min(1),
});

const deliverablesSchema = z.object({
  industry: z.string().min(1),
  mainContentType: z.string().optional(),
  platform: z.enum(['instagram', 'youtube', 'twitter']),
  contentTypes: z.array(z.string()).min(1),
  postingType: z.enum(['creator', 'brand']),
  usageRights: z.string().min(1).optional(),
  brandGuidelines: z.string().min(1),
  references: z.union([z.string(), z.array(z.string())]).optional(),
  scriptType: z.enum(['creator', 'brand']),
  scriptFlow: z.string().optional(),
  scriptFileName: z.string().nullable().optional(),
  proofOfWorkRequired: z.boolean().optional(),
});

const budgetSchema = z.object({
  budgetMode: z.enum(['paid', 'product', 'paid_product']),
  totalBudget: z.coerce.number().min(0.01),
  creatorStrategy: z.enum(['single', 'bulk']),
  mixMode: z.boolean(),
  selectedTier: tierEnum.optional(),
  creatorSizes: z.array(tierEnum).optional(),
  // Allow empty tierConfig (min length 0) so frontend can submit without amounts initially
  tierConfig: z.array(tierConfigSchema).min(0),
  platformFeePercent: z.coerce.number().min(0).max(100),
  productDetails: z.string().optional(),
  applicationDeadline: z.string(),
  workDeadline: z.string(),
  scriptDeadline: z.string().optional(),
});

const metaSchema = z.object({
  hashtags: z.array(z.string()).optional(),
  referenceUrls: z.array(z.string()).optional(),
  status: z.enum(['draft', 'active']).default('draft'),
  proofOfWorkReq: z.boolean().optional(),
});

export const createCampaignSchema = z
  .object({
    // New structured model
    basics: basicsSchema,
    deliverables: deliverablesSchema,
    budget: budgetSchema,
    meta: metaSchema.optional(),

    // Legacy flat fields kept optional for backward compatibility
    name: z.string().min(1).max(255).optional(),
    type: z.enum(['influencer', 'ugc', 'meme', 'twitter']).optional(),
    visibility: z.enum(['private', 'public']).optional(),
    objective: z.string().max(100).optional(),
    status: z.enum(['draft', 'active']).optional(),
  })
  .refine(
    (data) => {
      // industry should generally match niche
      if (data.basics.niche && data.deliverables.industry) {
        return data.basics.niche === data.deliverables.industry;
      }
      return true;
    },
    {
      message: 'deliverables.industry should match basics.niche',
      path: ['deliverables', 'industry'],
    }
  )
  .refine(
    (data) => {
      // When mixMode is false, selectedTier required; when true, creatorSizes required
      if (!data.budget.mixMode) {
        return !!data.budget.selectedTier;
      }
      return !!data.budget.creatorSizes && data.budget.creatorSizes.length > 0;
    },
    {
      message: 'For single tier, selectedTier is required; for multi tier, creatorSizes is required',
      path: ['budget'],
    }
  )
  .refine(
    (data) => {
      // scriptDeadline required when scriptType === 'creator'
      if (data.deliverables.scriptType === 'creator') {
        return !!data.budget.scriptDeadline;
      }
      return true;
    },
    {
      message: 'scriptDeadline is required when scriptType is creator',
      path: ['budget', 'scriptDeadline'],
    }
  );

export const updateCampaignSchema = z.object({
  basics: basicsSchema.partial().optional(),
  deliverables: deliverablesSchema.partial().optional(),
  budget: budgetSchema.partial().optional(),
  meta: metaSchema.partial().optional(),

  // Legacy flat fields also optional on update
  name: z.string().min(1).max(255).optional(),
  type: z.enum(['influencer', 'ugc', 'meme', 'twitter']).optional(),
  visibility: z.enum(['private', 'public']).optional(),
  objective: z.string().max(100).optional(),
  status: z.enum(['draft', 'active']).optional(),
});
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
