import { z } from 'zod';

// ─── Dashboard ────────────────────────────────────────────────────────────────
// No input schemas needed for GET /stats

// ─── Users ────────────────────────────────────────────────────────────────────
export const listUsersQuerySchema = z.object({
  role:     z.enum(['brand_owner', 'influencer']).optional(),
  isActive: z.string().optional().transform((v) => v === undefined ? undefined : v === 'true'),
  q:        z.string().optional(),
  page:     z.coerce.number().default(1),
  limit:    z.coerce.number().default(20),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

// ─── Campaigns ────────────────────────────────────────────────────────────────
export const listAdminCampaignsQuerySchema = z.object({
  status:   z.enum(['draft', 'active', 'script', 'work', 'completed', 'closed', 'withdrawn']).optional(),
  brandId:  z.string().uuid().optional(),
  page:     z.coerce.number().default(1),
  limit:    z.coerce.number().default(20),
});

// ─── Reports ──────────────────────────────────────────────────────────────────
export const listReportsQuerySchema = z.object({
  resolved: z.string().optional().transform((v) => v === undefined ? undefined : v === 'true'),
  reason:   z.enum(['spam', 'harassment', 'inappropriate_content', 'fake_account', 'scam', 'other']).optional(),
  page:     z.coerce.number().default(1),
  limit:    z.coerce.number().default(20),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type ListUsersQuery            = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserStatusDTO       = z.infer<typeof updateUserStatusSchema>;
export type ListAdminCampaignsQuery   = z.infer<typeof listAdminCampaignsQuerySchema>;
export type ListReportsQuery          = z.infer<typeof listReportsQuerySchema>;
