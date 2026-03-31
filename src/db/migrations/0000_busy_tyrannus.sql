CREATE TYPE "public"."budget_mode" AS ENUM('paid', 'product', 'paid_product');--> statement-breakpoint
CREATE TYPE "public"."campaign_payment_status" AS ENUM('pending', 'captured', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."campaign_payment_type" AS ENUM('advance', 'final');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'script', 'work', 'completed', 'closed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('influencer', 'ugc', 'meme', 'twitter');--> statement-breakpoint
CREATE TYPE "public"."campaign_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."ci_origin" AS ENUM('brand_invite', 'influencer_application');--> statement-breakpoint
CREATE TYPE "public"."ci_status" AS ENUM('invited', 'applied', 'negotiating', 'accepted', 'payment_pending', 'paid', 'product_pending', 'script_pending', 'script_review', 'work_pending', 'work_review', 'completed', 'settled', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('pending', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."influencer_tier" AS ENUM('nano', 'micro', 'mid', 'macro', 'mega');--> statement-breakpoint
CREATE TYPE "public"."message_sender_role" AS ENUM('brand', 'influencer', 'system');--> statement-breakpoint
CREATE TYPE "public"."negotiation_party" AS ENUM('brand', 'influencer');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('application', 'campaign_invite', 'script', 'submission', 'negotiation', 'payment', 'chat', 'system');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending_first', 'first_paid', 'pending_final', 'completed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."portfolio_media_type" AS ENUM('image', 'video', 'link');--> statement-breakpoint
CREATE TYPE "public"."report_context_type" AS ENUM('chat', 'campaign', 'profile');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'harassment', 'inappropriate_content', 'fake_account', 'scam', 'other');--> statement-breakpoint
CREATE TYPE "public"."script_status" AS ENUM('pending', 'approved', 'revision_requested');--> statement-breakpoint
CREATE TYPE "public"."settlement_method" AS ENUM('bank_transfer', 'upi', 'other');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('instagram', 'youtube', 'twitter');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."target_type" AS ENUM('brand', 'influencer');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('brand_owner', 'influencer', 'admin');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"phone_number" varchar(20),
	"password_hash" varchar(255),
	"name" varchar(255) NOT NULL,
	"role" "user_role" NOT NULL,
	"avatar_url" varchar(500),
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "brand_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"brand_name" varchar(255) NOT NULL,
	"brand_type" varchar(100),
	"brand_logo_url" varchar(500),
	"industry" varchar(100),
	"website" varchar(255),
	"city" varchar(255),
	"primary_language" varchar(100),
	"other_languages" text[] DEFAULT '{}',
	"description" text,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "influencer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"handle" varchar(100),
	"bio" text,
	"location" varchar(255),
	"niches" text[] DEFAULT '{}' NOT NULL,
	"tier" "influencer_tier",
	"follower_count" integer DEFAULT 0 NOT NULL,
	"engagement_rate" numeric(5, 2),
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rate_card" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"portfolio_urls" text[] DEFAULT '{}' NOT NULL,
	"accepting_collabs" boolean DEFAULT true NOT NULL,
	"featured_portfolio_ids" uuid[] DEFAULT '{}' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "influencer_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "campaign_type" NOT NULL,
	"visibility" "campaign_visibility" DEFAULT 'private' NOT NULL,
	"objective" varchar(100),
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"budget_mode" "budget_mode" NOT NULL,
	"budget_tier_pricing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget_total" numeric(12, 2),
	"platform_fee_percent" numeric(5, 2) DEFAULT '10.00' NOT NULL,
	"mix_mode" boolean,
	"selected_tier" varchar(20),
	"product_details" text,
	"location" varchar(255),
	"niches" text[] DEFAULT '{}' NOT NULL,
	"creator_sizes" text[] DEFAULT '{}' NOT NULL,
	"creators_invited" integer DEFAULT 0 NOT NULL,
	"creators_accepted" integer DEFAULT 0 NOT NULL,
	"applications_count" integer DEFAULT 0 NOT NULL,
	"pending_scripts" integer DEFAULT 0 NOT NULL,
	"pending_submissions" integer DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"brief" text,
	"dos" text[] DEFAULT '{}' NOT NULL,
	"donts" text[] DEFAULT '{}' NOT NULL,
	"reference_urls" text[] DEFAULT '{}' NOT NULL,
	"hashtags" text[] DEFAULT '{}' NOT NULL,
	"deliverables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proof_of_work_req" boolean DEFAULT false NOT NULL,
	"platform" varchar(50),
	"main_content_type" varchar(100),
	"content_types" text[] DEFAULT '{}' NOT NULL,
	"posting_type" varchar(50),
	"usage_rights" varchar(50),
	"script_type" varchar(50),
	"script_flow" text,
	"script_file_key" text,
	"thumbnail_url" text,
	"deadline" timestamp with time zone,
	"application_deadline" timestamp with time zone,
	"work_deadline" timestamp with time zone,
	"script_deadline" timestamp with time zone,
	"launched_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_influencers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"influencer_id" uuid NOT NULL,
	"origin" "ci_origin" NOT NULL,
	"status" "ci_status" DEFAULT 'invited' NOT NULL,
	"chat_enabled" boolean DEFAULT false NOT NULL,
	"tier_rate" numeric(12, 2),
	"agreed_budget" numeric(12, 2),
	"platform_fee" numeric(12, 2),
	"first_payment" numeric(12, 2),
	"final_payment" numeric(12, 2),
	"application_note" text,
	"applied_at" timestamp with time zone,
	"product_shipped_at" timestamp with time zone,
	"product_received_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now(),
	"paid_at" timestamp with time zone,
	"final_paid_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_influencers_campaign_id_influencer_id_unique" UNIQUE("campaign_id","influencer_id")
);
--> statement-breakpoint
CREATE TABLE "negotiations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_influencer_id" uuid NOT NULL,
	"party" "negotiation_party" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_influencer_id" uuid NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"file_url" varchar(500),
	"file_name" varchar(255),
	"external_url" varchar(500),
	"text_content" text,
	"media_type" varchar(50),
	"status" "script_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "work_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_influencer_id" uuid NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"type" varchar(50) NOT NULL,
	"url" varchar(500),
	"external_url" varchar(500),
	"text_content" text,
	"media_url" varchar(500),
	"media_type" varchar(50),
	"file_name" varchar(255),
	"proof_of_work_url" varchar(500),
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_influencer_id" uuid NOT NULL,
	"status" "payment_status" DEFAULT 'pending_first' NOT NULL,
	"first_amount" numeric(12, 2),
	"first_payment_id" varchar(255),
	"first_paid_at" timestamp with time zone,
	"final_amount" numeric(12, 2),
	"final_payment_id" varchar(255),
	"final_paid_at" timestamp with time zone,
	"refund_amount" numeric(12, 2),
	"refund_reason" text,
	"refunded_at" timestamp with time zone,
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"gateway" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"influencer_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"last_message" text,
	"last_message_at" timestamp with time zone,
	"brand_unread" integer DEFAULT 0 NOT NULL,
	"influencer_unread" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_campaign_id_influencer_id_unique" UNIQUE("campaign_id","influencer_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"sender_role" "message_sender_role" NOT NULL,
	"content" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"campaign_id" uuid,
	"campaign_name" varchar(255),
	"influencer_id" uuid,
	"influencer_name" varchar(255),
	"action_url" varchar(500),
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"snapshot_date" date DEFAULT now() NOT NULL,
	"total_likes" bigint DEFAULT 0 NOT NULL,
	"total_comments" bigint DEFAULT 0 NOT NULL,
	"total_shares" bigint DEFAULT 0 NOT NULL,
	"total_reach" bigint DEFAULT 0 NOT NULL,
	"engagement_rate" numeric(5, 2),
	"views" bigint DEFAULT 0 NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_snapshots_campaign_id_snapshot_date_unique" UNIQUE("campaign_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
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
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_profiles" ADD CONSTRAINT "influencer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_brand_id_brand_profiles_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_influencers" ADD CONSTRAINT "campaign_influencers_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_influencers" ADD CONSTRAINT "campaign_influencers_influencer_id_influencer_profiles_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_campaign_influencer_id_campaign_influencers_id_fk" FOREIGN KEY ("campaign_influencer_id") REFERENCES "public"."campaign_influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_versions" ADD CONSTRAINT "script_versions_campaign_influencer_id_campaign_influencers_id_fk" FOREIGN KEY ("campaign_influencer_id") REFERENCES "public"."campaign_influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_versions" ADD CONSTRAINT "script_versions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_submissions" ADD CONSTRAINT "work_submissions_campaign_influencer_id_campaign_influencers_id_fk" FOREIGN KEY ("campaign_influencer_id") REFERENCES "public"."campaign_influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_submissions" ADD CONSTRAINT "work_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_campaign_influencer_id_campaign_influencers_id_fk" FOREIGN KEY ("campaign_influencer_id") REFERENCES "public"."campaign_influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_payments" ADD CONSTRAINT "campaign_payments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_payments" ADD CONSTRAINT "campaign_payments_brand_user_id_users_id_fk" FOREIGN KEY ("brand_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_payment_items" ADD CONSTRAINT "campaign_payment_items_campaign_payment_id_campaign_payments_id_fk" FOREIGN KEY ("campaign_payment_id") REFERENCES "public"."campaign_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_payment_items" ADD CONSTRAINT "campaign_payment_items_campaign_influencer_id_campaign_influencers_id_fk" FOREIGN KEY ("campaign_influencer_id") REFERENCES "public"."campaign_influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_campaign_influencer_id_campaign_influencers_id_fk" FOREIGN KEY ("campaign_influencer_id") REFERENCES "public"."campaign_influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_brand_id_brand_profiles_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_influencer_id_influencer_profiles_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_influencer_id_influencer_profiles_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fcm_tokens" ADD CONSTRAINT "fcm_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_portfolios" ADD CONSTRAINT "influencer_portfolios_influencer_id_influencer_profiles_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_details" ADD CONSTRAINT "bank_details_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;