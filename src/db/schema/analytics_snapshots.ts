import { pgTable, uuid, date, timestamp, unique } from 'drizzle-orm/pg-core';
import { numeric } from 'drizzle-orm/pg-core';
import { bigint } from 'drizzle-orm/pg-core';
import { campaigns } from './campaigns';

export const analyticsSnapshots = pgTable(
  'analytics_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull().defaultNow(),
    totalLikes: bigint('total_likes', { mode: 'number' }).default(0).notNull(),
    totalComments: bigint('total_comments', { mode: 'number' }).default(0).notNull(),
    totalShares: bigint('total_shares', { mode: 'number' }).default(0).notNull(),
    totalReach: bigint('total_reach', { mode: 'number' }).default(0).notNull(),
    engagementRate: numeric('engagement_rate', { precision: 5, scale: 2 }),
    views: bigint('views', { mode: 'number' }).default(0).notNull(),
    clicks: bigint('clicks', { mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueCampaignDate: unique().on(table.campaignId, table.snapshotDate),
  })
);

export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type NewAnalyticsSnapshot = typeof analyticsSnapshots.$inferInsert;
