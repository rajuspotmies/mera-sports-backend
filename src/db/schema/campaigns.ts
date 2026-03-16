import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  numeric,
} from 'drizzle-orm/pg-core';
import {
  campaignTypeEnum,
  campaignVisibilityEnum,
  campaignStatusEnum,
  budgetModeEnum,
} from './enums';
import { brandProfiles } from './brand_profiles';

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id')
    .notNull()
    .references(() => brandProfiles.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  type: campaignTypeEnum('type').notNull(),
  visibility: campaignVisibilityEnum('visibility').notNull().default('private'),
  objective: varchar('objective', { length: 100 }),
  status: campaignStatusEnum('status').notNull().default('draft'),

  // Budget
  budgetMode: budgetModeEnum('budget_mode').notNull(),
  // [{ tier: 'micro', rate: 5000 }, { tier: 'mid', rate: 15000 }]
  budgetTierPricing: jsonb('budget_tier_pricing')
    .$type<Array<{ tier: string; rate: number }>>()
    .default([])
    .notNull(),
  budgetTotal: numeric('budget_total', { precision: 12, scale: 2 }),
  platformFeePercent: numeric('platform_fee_percent', { precision: 5, scale: 2 })
    .default('10.00')
    .notNull(),

  // Budget strategy / tiers
  creatorStrategy: varchar('creator_strategy', { length: 50 }), // 'single' | 'bulk'
  mixMode: boolean('mix_mode'), // true = multi tier, false = single tier
  selectedTier: varchar('selected_tier', { length: 20 }), // when mixMode === false
  productDetails: text('product_details'),

  // Campaign details
  location: varchar('location', { length: 255 }),
  niches: text('niches').array().default([]).notNull(),
  creatorSizes: text('creator_sizes').array().default([]).notNull(),
  creatorsInvited: integer('creators_invited').default(0).notNull(),
  creatorsAccepted: integer('creators_accepted').default(0).notNull(),
  applicationsCount: integer('applications_count').default(0).notNull(),
  pendingScripts: integer('pending_scripts').default(0).notNull(),
  pendingSubmissions: integer('pending_submissions').default(0).notNull(),
  progress: integer('progress').default(0).notNull(),

  // Creative / deliverables
  brief: text('brief'),
  dos: text('dos').array().default([]).notNull(),
  donts: text('donts').array().default([]).notNull(),
  referenceUrls: text('reference_urls').array().default([]).notNull(),
  hashtags: text('hashtags').array().default([]).notNull(),
  // [{ type: 'instagram_reel', count: 1 }]
  deliverables: jsonb('deliverables')
    .$type<Array<{ type: string; count: number }>>()
    .default([])
    .notNull(),
  proofOfWorkReq: boolean('proof_of_work_req').default(false).notNull(),

  // More detailed deliverables/config
  platform: varchar('platform', { length: 50 }), // instagram | youtube | twitter
  contentTypes: text('content_types').array().default([]).notNull(),
  postingType: varchar('posting_type', { length: 50 }), // creator | brand
  usageRights: varchar('usage_rights', { length: 50 }), // e.g. 30d, 90d
  scriptType: varchar('script_type', { length: 50 }), // creator | brand
  scriptFlow: text('script_flow'),
  scriptFileKey: varchar('script_file_key', { length: 500 }),

  // Media
  thumbnailUrl: varchar('thumbnail_url', { length: 500 }),

  // Lifecycle
  // Legacy single deadline; still populated from applicationDeadline when present.
  deadline: timestamp('deadline', { withTimezone: true }),
  applicationDeadline: timestamp('application_deadline', { withTimezone: true }),
  workDeadline: timestamp('work_deadline', { withTimezone: true }),
  scriptDeadline: timestamp('script_deadline', { withTimezone: true }),
  launchedAt: timestamp('launched_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
