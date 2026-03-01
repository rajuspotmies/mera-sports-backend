import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { numeric } from 'drizzle-orm/pg-core';
import { negotiationPartyEnum } from './enums';
import { campaignInfluencers } from './campaign_influencers';

export const negotiations = pgTable('negotiations', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignInfluencerId: uuid('campaign_influencer_id')
    .notNull()
    .references(() => campaignInfluencers.id, { onDelete: 'cascade' }),
  party: negotiationPartyEnum('party').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Negotiation = typeof negotiations.$inferSelect;
export type NewNegotiation = typeof negotiations.$inferInsert;
