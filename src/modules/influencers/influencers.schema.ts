import { z } from 'zod';

export const updateInfluencerProfileSchema = z.object({
  handle: z.string().max(100).optional(),
  bio: z.string().max(2000).optional(),
  about: z.string().max(5000).optional(),
  location: z.string().max(255).optional(),
  niches: z.array(z.string()).optional(),
  tier: z.enum(['nano', 'micro', 'mid', 'macro', 'mega']).optional(),
  followerCount: z.number().int().min(0).optional(),
  engagementRate: z.number().min(0).max(100).optional(),
  platforms: z
    .array(
      z.object({
        platform: z.string(),
        handle: z.string(),
        followers: z.number().int().min(0),
      })
    )
    .optional(),
  rateCard: z.record(z.string(), z.number().min(0)).optional(),
  portfolioUrls: z.array(z.string().url()).optional(),
  acceptingCollabs: z.boolean().optional(),
  featuredPortfolioIds: z.array(z.string().uuid()).max(10).optional(),
  settings: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).optional(),
});

export const searchInfluencersSchema = z.object({
  q: z.string().optional(),
  niche: z.union([z.string(), z.array(z.string())]).optional(),
  tier: z.union([z.string(), z.array(z.string())]).optional(),
  location: z.string().optional(),
  minFollowers: z.coerce.number().optional(),
  maxFollowers: z.coerce.number().optional(),
  minEngagement: z.coerce.number().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  brandId: z.string().uuid().optional(),
  savedOnly: z.coerce.boolean().optional(),
});

export const inviteInfluencersSchema = z.object({
  influencerIds: z.array(z.string().uuid()).min(1).max(50),
  campaignId: z.string().uuid(),
  message: z.string().max(500).optional(),
});

export const addPortfolioItemSchema = z.object({
  title: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  mediaUrl: z.string().min(1), // accepts both full URLs and S3 storage keys
  mediaType: z.enum(['image', 'video', 'link']),
  externalUrl: z.string().url().optional(),
});

export const updatePortfolioItemSchema = addPortfolioItemSchema.partial();

export type UpdateInfluencerProfileDTO = z.infer<typeof updateInfluencerProfileSchema>;
export type SearchInfluencersQuery = z.infer<typeof searchInfluencersSchema>;
export type InviteInfluencersDTO = z.infer<typeof inviteInfluencersSchema>;
export type AddPortfolioItemDTO = z.infer<typeof addPortfolioItemSchema>;
export type UpdatePortfolioItemDTO = z.infer<typeof updatePortfolioItemSchema>;
