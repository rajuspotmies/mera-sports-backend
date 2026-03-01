import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { numeric } from 'drizzle-orm/pg-core';
import { paymentStatusEnum } from './enums';
import { campaignInfluencers } from './campaign_influencers';

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignInfluencerId: uuid('campaign_influencer_id')
    .notNull()
    .references(() => campaignInfluencers.id, { onDelete: 'cascade' }),
  status: paymentStatusEnum('status').notNull().default('pending_first'),

  // First payment (50% upfront)
  firstAmount: numeric('first_amount', { precision: 12, scale: 2 }),
  firstPaymentId: varchar('first_payment_id', { length: 255 }), // gateway txn ID
  firstPaidAt: timestamp('first_paid_at', { withTimezone: true }),

  // Final payment (50% on completion)
  finalAmount: numeric('final_amount', { precision: 12, scale: 2 }),
  finalPaymentId: varchar('final_payment_id', { length: 255 }),
  finalPaidAt: timestamp('final_paid_at', { withTimezone: true }),

  // Refund
  refundAmount: numeric('refund_amount', { precision: 12, scale: 2 }),
  refundReason: text('refund_reason'),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),

  currency: varchar('currency', { length: 10 }).default('INR').notNull(),
  gateway: varchar('gateway', { length: 50 }), // 'razorpay' | 'stripe'

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
