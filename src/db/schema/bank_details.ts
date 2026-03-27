import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const bankDetails = pgTable('bank_details', {
  id:                uuid('id').primaryKey().defaultRandom(),
  userId:            uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  accountHolderName: text('account_holder_name').notNull(),
  accountNumber:     text('account_number').notNull(),
  ifscCode:          text('ifsc_code').notNull(),
  bankName:          text('bank_name'),
  upiId:             text('upi_id'),
  createdAt:         timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type BankDetail    = typeof bankDetails.$inferSelect;
export type NewBankDetail = typeof bankDetails.$inferInsert;
