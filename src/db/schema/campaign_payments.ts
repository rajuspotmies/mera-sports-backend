import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  numeric,
} from 'drizzle-orm/pg-core';
import { campaignPaymentStatusEnum, campaignPaymentTypeEnum } from './enums';
import { campaigns } from './campaigns';
import { users } from './users';

export const campaignPayments = pgTable('campaign_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  brandUserId: uuid('brand_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  round: integer('round').notNull().default(1),
  paymentType: campaignPaymentTypeEnum('payment_type').notNull(),

  // Amounts
  influencerBudgetTotal: numeric('influencer_budget_total', { precision: 14, scale: 2 }).notNull(),
  platformFeePercent: numeric('platform_fee_percent', { precision: 5, scale: 2 }).notNull(),
  platformFeeAmount: numeric('platform_fee_amount', { precision: 14, scale: 2 }).notNull(),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),

  // Gateway
  razorpayOrderId: varchar('razorpay_order_id', { length: 255 }),
  razorpayPaymentId: varchar('razorpay_payment_id', { length: 255 }),
  status: campaignPaymentStatusEnum('status').notNull().default('pending'),

  currency: varchar('currency', { length: 10 }).default('INR').notNull(),
  notes: text('notes'),

  capturedAt: timestamp('captured_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type CampaignPayment = typeof campaignPayments.$inferSelect;
export type NewCampaignPayment = typeof campaignPayments.$inferInsert;
