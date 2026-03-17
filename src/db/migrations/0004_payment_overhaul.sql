-- Payment overhaul: campaign-level payments + admin settlements
-- Run with: pnpm exec tsx src/scripts/run-migration-0004.ts

-- 1. Add 'settled' to ci_status enum
ALTER TYPE "public"."ci_status" ADD VALUE IF NOT EXISTS 'settled' AFTER 'completed';

-- 2. Add settledAt to campaign_influencers
ALTER TABLE "campaign_influencers"
  ADD COLUMN IF NOT EXISTS "settled_at" timestamptz;

-- 3. Remove creatorStrategy from campaigns (column may not exist)
ALTER TABLE "campaigns"
  DROP COLUMN IF EXISTS "creator_strategy";

-- 4. New enums for campaign payments
DO $$ BEGIN
  CREATE TYPE "public"."campaign_payment_status" AS ENUM ('pending', 'captured', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."campaign_payment_type" AS ENUM ('advance', 'final');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."settlement_method" AS ENUM ('bank_transfer', 'upi', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Campaign payments table (one row per payment round)
CREATE TABLE IF NOT EXISTS "campaign_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "brand_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "round" integer NOT NULL DEFAULT 1,
  "payment_type" "campaign_payment_type" NOT NULL,
  "influencer_budget_total" numeric(14,2) NOT NULL,
  "platform_fee_percent" numeric(5,2) NOT NULL,
  "platform_fee_amount" numeric(14,2) NOT NULL,
  "total_amount" numeric(14,2) NOT NULL,
  "razorpay_order_id" varchar(255),
  "razorpay_payment_id" varchar(255),
  "status" "campaign_payment_status" NOT NULL DEFAULT 'pending',
  "currency" varchar(10) NOT NULL DEFAULT 'INR',
  "notes" text,
  "captured_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- 6. Campaign payment items (which CIs are in each payment)
CREATE TABLE IF NOT EXISTS "campaign_payment_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_payment_id" uuid NOT NULL REFERENCES "campaign_payments"("id") ON DELETE CASCADE,
  "campaign_influencer_id" uuid NOT NULL REFERENCES "campaign_influencers"("id") ON DELETE CASCADE,
  "agreed_budget" numeric(12,2) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- 7. Settlements table (admin payouts to influencers)
CREATE TABLE IF NOT EXISTS "settlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_influencer_id" uuid NOT NULL REFERENCES "campaign_influencers"("id") ON DELETE CASCADE,
  "admin_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "amount" numeric(12,2) NOT NULL,
  "method" "settlement_method" NOT NULL,
  "reference" varchar(255),
  "notes" text,
  "settled_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
