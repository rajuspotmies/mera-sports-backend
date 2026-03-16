-- Add detailed campaign fields for new creation model

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "cover_image_key" varchar(500),
  ADD COLUMN IF NOT EXISTS "creator_strategy" varchar(50),
  ADD COLUMN IF NOT EXISTS "mix_mode" boolean,
  ADD COLUMN IF NOT EXISTS "selected_tier" varchar(20),
  ADD COLUMN IF NOT EXISTS "product_details" text,
  ADD COLUMN IF NOT EXISTS "platform" varchar(50),
  ADD COLUMN IF NOT EXISTS "content_types" text[] DEFAULT '{}'::text[] NOT NULL,
  ADD COLUMN IF NOT EXISTS "posting_type" varchar(50),
  ADD COLUMN IF NOT EXISTS "usage_rights" varchar(50),
  ADD COLUMN IF NOT EXISTS "script_type" varchar(50),
  ADD COLUMN IF NOT EXISTS "script_flow" text,
  ADD COLUMN IF NOT EXISTS "script_file_key" varchar(500),
  ADD COLUMN IF NOT EXISTS "application_deadline" timestamptz,
  ADD COLUMN IF NOT EXISTS "work_deadline" timestamptz,
  ADD COLUMN IF NOT EXISTS "script_deadline" timestamptz;

