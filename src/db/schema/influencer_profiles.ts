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
import { influencerTierEnum } from './enums';
import { users } from './users';

export const influencerProfiles = pgTable('influencer_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  handle: varchar('handle', { length: 100 }),
  bio: text('bio'),
  location: varchar('location', { length: 255 }),
  niches: text('niches').array().default([]).notNull(),
  tier: influencerTierEnum('tier'),
  followerCount: integer('follower_count').default(0).notNull(),
  engagementRate: numeric('engagement_rate', { precision: 5, scale: 2 }),
  // [{ platform: 'instagram', handle: '@foo', followers: 10000 }]
  platforms: jsonb('platforms').$type<Array<{ platform: string; handle: string; followers: number }>>().default([]).notNull(),
  // { instagram_reel: 5000, youtube_video: 15000 }
  rateCard: jsonb('rate_card').$type<Record<string, number>>().default({}).notNull(),
  portfolioUrls: text('portfolio_urls').array().default([]).notNull(),
  acceptingCollabs: boolean('accepting_collabs').default(true).notNull(),
  featuredPortfolioIds: uuid('featured_portfolio_ids').array().default([]).notNull(),
  settings: jsonb('settings').$type<Record<string, boolean | string | number>>().default({}).notNull(),
  isVerified: boolean('is_verified').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type InfluencerProfile = typeof influencerProfiles.$inferSelect;
export type NewInfluencerProfile = typeof influencerProfiles.$inferInsert;
