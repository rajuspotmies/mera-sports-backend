import { pgTable, uuid, numeric, timestamp } from 'drizzle-orm/pg-core';
import { campaignPayments } from './campaign_payments';
import { campaignInfluencers } from './campaign_influencers';

export const campaignPaymentItems = pgTable('campaign_payment_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignPaymentId: uuid('campaign_payment_id')
    .notNull()
    .references(() => campaignPayments.id, { onDelete: 'cascade' }),
  campaignInfluencerId: uuid('campaign_influencer_id')
    .notNull()
    .references(() => campaignInfluencers.id, { onDelete: 'cascade' }),

  agreedBudget: numeric('agreed_budget', { precision: 12, scale: 2 }).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CampaignPaymentItem = typeof campaignPaymentItems.$inferSelect;
export type NewCampaignPaymentItem = typeof campaignPaymentItems.$inferInsert;
