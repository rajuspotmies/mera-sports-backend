import { pgTable, uuid, varchar, text, timestamp, numeric } from 'drizzle-orm/pg-core';
import { settlementMethodEnum } from './enums';
import { campaignInfluencers } from './campaign_influencers';
import { users } from './users';

export const settlements = pgTable('settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignInfluencerId: uuid('campaign_influencer_id')
    .notNull()
    .references(() => campaignInfluencers.id, { onDelete: 'cascade' }),
  adminUserId: uuid('admin_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'set null' }),

  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  method: settlementMethodEnum('method').notNull(),
  reference: varchar('reference', { length: 255 }),
  notes: text('notes'),

  settledAt: timestamp('settled_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;
