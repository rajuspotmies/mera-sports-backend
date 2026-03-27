CREATE TYPE "public"."campaign_payment_status" AS ENUM('pending', 'captured', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."campaign_payment_type" AS ENUM('advance', 'final');--> statement-breakpoint
CREATE TYPE "public"."portfolio_media_type" AS ENUM('image', 'video', 'link');--> statement-breakpoint
CREATE TYPE "public"."report_context_type" AS ENUM('chat', 'campaign', 'profile');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'harassment', 'inappropriate_content', 'fake_account', 'scam', 'other');--> statement-breakpoint
CREATE TYPE "public"."settlement_method" AS ENUM('bank_transfer', 'upi', 'other');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('instagram', 'youtube', 'twitter');--> statement-breakpoint
CREATE TYPE "public"."target_type" AS ENUM('brand', 'influencer');--> statement-breakpoint
ALTER TYPE "public"."ci_status" ADD VALUE 'settled' BEFORE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'campaign_invite' BEFORE 'script';--> statement-breakpoint
CREATE TABLE "campaign_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"brand_user_id" uuid NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"payment_type" "campaign_payment_type" NOT NULL,
	"influencer_budget_total" numeric(14, 2) NOT NULL,
	"platform_fee_percent" numeric(5, 2) NOT NULL,
	"platform_fee_amount" numeric(14, 2) NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"razorpay_order_id" varchar(255),
	"razorpay_payment_id" varchar(255),
	"status" "campaign_payment_status" DEFAULT 'pending' NOT NULL,
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"notes" text,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_payment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_payment_id" uuid NOT NULL,
	"campaign_influencer_id" uuid NOT NULL,
	"agreed_budget" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_influencer_id" uuid NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "settlement_method" NOT NULL,
	"reference" varchar(255),
	"notes" text,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fcm_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(500) NOT NULL,
	"device_type" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fcm_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"code" varchar(6) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_codes_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "influencer_portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"influencer_id" uuid NOT NULL,
	"title" varchar(255),
	"description" text,
	"media_url" text NOT NULL,
	"media_type" "portfolio_media_type" DEFAULT 'image' NOT NULL,
	"external_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"target_type" "target_type" NOT NULL,
	"reason" "report_reason" NOT NULL,
	"description" text,
	"context_type" "report_context_type",
	"context_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"target_type" "target_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_user_id_target_id_unique" UNIQUE("user_id","target_id")
);
--> statement-breakpoint
CREATE TABLE "social_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"platform_user_id" varchar(100),
	"platform_handle" varchar(100),
	"access_token" text,
	"refresh_token" text,
	"token_expiry" timestamp with time zone,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"engagement_rate" numeric(5, 2),
	"is_connected" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_connections_user_id_platform_unique" UNIQUE("user_id","platform")
);
--> statement-breakpoint
CREATE TABLE "bank_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_holder_name" text NOT NULL,
	"account_number" text NOT NULL,
	"ifsc_code" text NOT NULL,
	"bank_name" text,
	"upi_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_details_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "thumbnail_url" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "script_versions" ALTER COLUMN "file_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "script_versions" ALTER COLUMN "file_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "work_submissions" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_number" varchar(20);--> statement-breakpoint
ALTER TABLE "influencer_profiles" ADD COLUMN "accepting_collabs" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "influencer_profiles" ADD COLUMN "featured_portfolio_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "influencer_profiles" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "mix_mode" boolean;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "selected_tier" varchar(20);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "product_details" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "platform" varchar(50);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "content_types" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "posting_type" varchar(50);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "usage_rights" varchar(50);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "script_type" varchar(50);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "script_flow" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "script_file_key" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "application_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "work_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "script_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_influencers" ADD COLUMN "product_shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_influencers" ADD COLUMN "product_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_influencers" ADD COLUMN "final_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_influencers" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "script_versions" ADD COLUMN "external_url" varchar(500);--> statement-breakpoint
ALTER TABLE "script_versions" ADD COLUMN "text_content" text;--> statement-breakpoint
ALTER TABLE "script_versions" ADD COLUMN "media_type" varchar(50);--> statement-breakpoint
ALTER TABLE "work_submissions" ADD COLUMN "version_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "work_submissions" ADD COLUMN "external_url" varchar(500);--> statement-breakpoint
ALTER TABLE "work_submissions" ADD COLUMN "text_content" text;--> statement-breakpoint
ALTER TABLE "work_submissions" ADD COLUMN "media_url" varchar(500);--> statement-breakpoint
ALTER TABLE "work_submissions" ADD COLUMN "media_type" varchar(50);--> statement-breakpoint
ALTER TABLE "campaign_payments" ADD CONSTRAINT "campaign_payments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_payments" ADD CONSTRAINT "campaign_payments_brand_user_id_users_id_fk" FOREIGN KEY ("brand_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_payment_items" ADD CONSTRAINT "campaign_payment_items_campaign_payment_id_campaign_payments_id_fk" FOREIGN KEY ("campaign_payment_id") REFERENCES "public"."campaign_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_payment_items" ADD CONSTRAINT "campaign_payment_items_campaign_influencer_id_campaign_influencers_id_fk" FOREIGN KEY ("campaign_influencer_id") REFERENCES "public"."campaign_influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_campaign_influencer_id_campaign_influencers_id_fk" FOREIGN KEY ("campaign_influencer_id") REFERENCES "public"."campaign_influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fcm_tokens" ADD CONSTRAINT "fcm_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_portfolios" ADD CONSTRAINT "influencer_portfolios_influencer_id_influencer_profiles_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_details" ADD CONSTRAINT "bank_details_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number");