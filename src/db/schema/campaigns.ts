import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';
import { numeric } from 'drizzle-orm/pg-core';
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

  // Creative
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

  // Media
  thumbnailUrl: varchar('thumbnail_url', { length: 500 }),

  // Lifecycle
  deadline: timestamp('deadline', { withTimezone: true }),
  launchedAt: timestamp('launched_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
