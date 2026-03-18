-- 0005: Add product tracking + finalPaidAt to campaign_influencers

-- Product shipment tracking
ALTER TABLE "campaign_influencers"
  ADD COLUMN IF NOT EXISTS "product_shipped_at" timestamptz;

ALTER TABLE "campaign_influencers"
  ADD COLUMN IF NOT EXISTS "product_received_at" timestamptz;

-- Final payment timestamp (set when brand's final payment is captured)
ALTER TABLE "campaign_influencers"
  ADD COLUMN IF NOT EXISTS "final_paid_at" timestamptz;
