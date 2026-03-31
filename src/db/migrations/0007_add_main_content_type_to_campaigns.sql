ALTER TABLE "campaigns"
ADD COLUMN IF NOT EXISTS "main_content_type" varchar(100);
