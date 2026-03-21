ALTER TABLE "script_versions"
ADD COLUMN IF NOT EXISTS "external_url" varchar(500),
ADD COLUMN IF NOT EXISTS "text_content" text,
ADD COLUMN IF NOT EXISTS "media_type" varchar(50);

ALTER TABLE "script_versions"
ALTER COLUMN "file_url" DROP NOT NULL;

ALTER TABLE "script_versions"
ALTER COLUMN "file_name" DROP NOT NULL;

ALTER TABLE "work_submissions"
ADD COLUMN IF NOT EXISTS "version_number" integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "external_url" varchar(500),
ADD COLUMN IF NOT EXISTS "text_content" text,
ADD COLUMN IF NOT EXISTS "media_url" varchar(500),
ADD COLUMN IF NOT EXISTS "media_type" varchar(50);

ALTER TABLE "work_submissions"
ALTER COLUMN "url" DROP NOT NULL;
