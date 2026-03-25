import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { reportReasonEnum, reportContextTypeEnum, targetTypeEnum } from './enums';

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  targetId: uuid('target_id').notNull(),
  targetType: targetTypeEnum('target_type').notNull(),
  reason: reportReasonEnum('reason').notNull(),
  description: text('description'),
  contextType: reportContextTypeEnum('context_type'),
  contextId: uuid('context_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
