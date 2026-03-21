import { pgTable, uuid, varchar, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { submissionStatusEnum } from './enums';
import { campaignInfluencers } from './campaign_influencers';
import { users } from './users';

export const workSubmissions = pgTable('work_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignInfluencerId: uuid('campaign_influencer_id')
    .notNull()
    .references(() => campaignInfluencers.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull().default(1),
  type: varchar('type', { length: 50 }).notNull(), // 'instagram_reel', 'youtube_video', etc.
  url: varchar('url', { length: 500 }),             // Backward-compatible public URL field
  externalUrl: varchar('external_url', { length: 500 }),
  textContent: text('text_content'),
  mediaUrl: varchar('media_url', { length: 500 }),
  mediaType: varchar('media_type', { length: 50 }),
  fileName: varchar('file_name', { length: 255 }),
  proofOfWorkUrl: varchar('proof_of_work_url', { length: 500 }),
  status: submissionStatusEnum('status').notNull().default('pending'),
  reviewNote: text('review_note'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
});

export type WorkSubmission = typeof workSubmissions.$inferSelect;
export type NewWorkSubmission = typeof workSubmissions.$inferInsert;
