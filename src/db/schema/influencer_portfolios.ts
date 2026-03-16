import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { influencerProfiles } from './influencer_profiles';
import { portfolioMediaTypeEnum } from './enums';

export const influencerPortfolios = pgTable('influencer_portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  influencerId: uuid('influencer_id')
    .notNull()
    .references(() => influencerProfiles.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }),
  description: text('description'),
  mediaUrl: text('media_url').notNull(),
  mediaType: portfolioMediaTypeEnum('media_type').default('image').notNull(),
  externalUrl: text('external_url'), // link to live post/work
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type InfluencerPortfolio = typeof influencerPortfolios.$inferSelect;
export type NewInfluencerPortfolio = typeof influencerPortfolios.$inferInsert;
