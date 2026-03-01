import { pgTable, uuid, varchar, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { scriptStatusEnum } from './enums';
import { campaignInfluencers } from './campaign_influencers';
import { users } from './users';

export const scriptVersions = pgTable('script_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignInfluencerId: uuid('campaign_influencer_id')
    .notNull()
    .references(() => campaignInfluencers.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull().default(1),
  fileUrl: varchar('file_url', { length: 500 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  status: scriptStatusEnum('status').notNull().default('pending'),
  reviewNote: text('review_note'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
});

export type ScriptVersion = typeof scriptVersions.$inferSelect;
export type NewScriptVersion = typeof scriptVersions.$inferInsert;
