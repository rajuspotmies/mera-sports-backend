import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['brand_owner', 'influencer', 'admin']);

export const campaignTypeEnum = pgEnum('campaign_type', ['influencer', 'ugc', 'meme', 'twitter']);

export const campaignVisibilityEnum = pgEnum('campaign_visibility', ['private', 'public']);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'active',
  'script',
  'work',
  'completed',
  'closed',
  'withdrawn',
]);

export const budgetModeEnum = pgEnum('budget_mode', ['paid', 'product', 'paid_product']);

export const influencerTierEnum = pgEnum('influencer_tier', [
  'nano',
  'micro',
  'mid',
  'macro',
  'mega',
]);

// Core pipeline status — reflects full influencer lifecycle within a campaign
export const ciStatusEnum = pgEnum('ci_status', [
  'invited',          // Brand invited influencer (origin: brand_invite)
  'applied',          // Influencer applied (origin: influencer_application)
  'negotiating',      // Either party has made a counter-offer
  'accepted',         // Both parties agreed on rate — conversation enabled
  'payment_pending',  // Awaiting first payment from brand
  'paid',             // First payment confirmed
  'script_pending',   // Awaiting script submission
  'script_review',    // Script submitted, awaiting brand review
  'work_pending',     // Script approved, awaiting content submission
  'work_review',      // Work submitted, awaiting brand review
  'completed',        // Work approved — deal done
  'rejected',         // Brand rejected application/negotiation
  'withdrawn',        // Influencer withdrew
]);

export const ciOriginEnum = pgEnum('ci_origin', ['brand_invite', 'influencer_application']);

export const negotiationPartyEnum = pgEnum('negotiation_party', ['brand', 'influencer']);

export const scriptStatusEnum = pgEnum('script_status', [
  'pending',
  'approved',
  'revision_requested',
]);

export const submissionStatusEnum = pgEnum('submission_status', [
  'pending',
  'approved',
  'rejected',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending_first',
  'first_paid',
  'pending_final',
  'completed',
  'refunded',
]);

export const conversationStatusEnum = pgEnum('conversation_status', [
  'pending',
  'active',
  'archived',
]);

export const messageSenderRoleEnum = pgEnum('message_sender_role', [
  'brand',
  'influencer',
  'system',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'application',
  'campaign_invite',
  'script',
  'submission',
  'negotiation',
  'payment',
  'chat',
  'system',
]);

export const portfolioMediaTypeEnum = pgEnum('portfolio_media_type', ['image', 'video', 'link']);
