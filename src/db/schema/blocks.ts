import { pgTable, uuid, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users';
import { targetTypeEnum } from './enums';

export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id').notNull(),
    targetType: targetTypeEnum('target_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueBlock: unique().on(table.userId, table.targetId),
  })
);

export type Block = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
