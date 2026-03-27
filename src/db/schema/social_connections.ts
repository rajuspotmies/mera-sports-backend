import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import { numeric } from 'drizzle-orm/pg-core';
import { socialPlatformEnum } from './enums';
import { users } from './users';

export const socialConnections = pgTable(
  'social_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: socialPlatformEnum('platform').notNull(),
    platformUserId: varchar('platform_user_id', { length: 100 }),
    platformHandle: varchar('platform_handle', { length: 100 }),
    // AES-256-GCM encrypted. Format: iv:authTag:ciphertext (all hex)
    accessToken: text('access_token'),
    // Nullable — Instagram uses long-lived tokens (no refresh). YouTube/Twitter use this.
    refreshToken: text('refresh_token'),
    tokenExpiry: timestamp('token_expiry', { withTimezone: true }),
    followerCount: integer('follower_count').default(0).notNull(),
    engagementRate: numeric('engagement_rate', { precision: 5, scale: 2 }),
    isConnected: boolean('is_connected').default(false).notNull(),
    metadata: jsonb('metadata')
      .$type<{
        pageId?: string;
        avgLikes?: number;
        avgComments?: number;
        mediaCount?: number;
      }>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUserPlatform: unique().on(table.userId, table.platform),
  }),
);

export type SocialConnection = typeof socialConnections.$inferSelect;
export type NewSocialConnection = typeof socialConnections.$inferInsert;
