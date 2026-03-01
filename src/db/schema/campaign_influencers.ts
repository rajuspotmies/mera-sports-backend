import {
  pgTable,
  uuid,
  boolean,
  timestamp,
  text,
  unique,
} from 'drizzle-orm/pg-core';
import { numeric } from 'drizzle-orm/pg-core';
import { ciStatusEnum, ciOriginEnum } from './enums';
import { campaigns } from './campaigns';
import { influencerProfiles } from './influencer_profiles';

export const campaignInfluencers = pgTable(
  'campaign_influencers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    influencerId: uuid('influencer_id')
      .notNull()
      .references(() => influencerProfiles.id, { onDelete: 'cascade' }),
    origin: ciOriginEnum('origin').notNull(),
    status: ciStatusEnum('status').notNull().default('invited'),
    chatEnabled: boolean('chat_enabled').default(false).notNull(),

    // Financial
    tierRate: numeric('tier_rate', { precision: 12, scale: 2 }),         // Brand's initial offer
    agreedBudget: numeric('agreed_budget', { precision: 12, scale: 2 }), // Final agreed amount
    platformFee: numeric('platform_fee', { precision: 12, scale: 2 }),
    firstPayment: numeric('first_payment', { precision: 12, scale: 2 }),
    finalPayment: numeric('final_payment', { precision: 12, scale: 2 }),

    // Application data
    applicationNote: text('application_note'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),

    // Lifecycle timestamps
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueCampaignInfluencer: unique().on(table.campaignId, table.influencerId),
  })
);

export type CampaignInfluencer = typeof campaignInfluencers.$inferSelect;
export type NewCampaignInfluencer = typeof campaignInfluencers.$inferInsert;
