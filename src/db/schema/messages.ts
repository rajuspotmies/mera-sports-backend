import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { messageSenderRoleEnum } from './enums';
import { conversations } from './conversations';
import { users } from './users';

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id')
    .notNull()
    .references(() => users.id),
  senderRole: messageSenderRoleEnum('sender_role').notNull(),
  content: text('content').notNull(),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
