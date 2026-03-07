ALTER TABLE "brand_profiles" ADD COLUMN "brand_type" varchar(100);--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "city" varchar(255);--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "primary_language" varchar(100);--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD COLUMN "other_languages" text[] DEFAULT '{}';