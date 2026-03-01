import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { notificationTypeEnum } from './enums';
import { users } from './users';
import { campaigns } from './campaigns';
import { influencerProfiles } from './influencer_profiles';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  campaignId: uuid('campaign_id').references(() => campaigns.id),
  campaignName: varchar('campaign_name', { length: 255 }),
  influencerId: uuid('influencer_id').references(() => influencerProfiles.id),
  influencerName: varchar('influencer_name', { length: 255 }),
  actionUrl: varchar('action_url', { length: 500 }),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
