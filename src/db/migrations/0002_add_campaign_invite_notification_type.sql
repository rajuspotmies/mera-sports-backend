-- Add 'campaign_invite' to notification_type enum for invite notifications with Accept/Decline actions
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'campaign_invite';
