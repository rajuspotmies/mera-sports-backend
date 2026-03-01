import { pgTable, uuid, text, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { conversationStatusEnum } from './enums';
import { campaigns } from './campaigns';
import { brandProfiles } from './brand_profiles';
import { influencerProfiles } from './influencer_profiles';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brandProfiles.id),
    influencerId: uuid('influencer_id')
      .notNull()
      .references(() => influencerProfiles.id),
    status: conversationStatusEnum('status').notNull().default('active'),
    lastMessage: text('last_message'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    brandUnread: integer('brand_unread').default(0).notNull(),
    influencerUnread: integer('influencer_unread').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueCampaignInfluencer: unique().on(table.campaignId, table.influencerId),
  })
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
