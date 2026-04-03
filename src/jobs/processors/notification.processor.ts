import { Job } from 'bull';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import {
  getTokensForUser,
  unregisterFcmToken,
  parseConversationIdFromActionUrl,
} from '@/modules/notifications/notifications.service';
import { sendPushNotification } from '@/shared/services/fcm.service';

/** Map a notification type to the FCM category identifier used for action buttons on iOS/Android. */
function notificationCategory(type: string): string | undefined {
  if (type === 'chat') return 'chat';
  if (['application', 'campaign_invite', 'negotiation', 'script', 'submission'].includes(type))
    return 'campaign';
  if (type === 'payment') return 'payment';
  return undefined;
}

/** Job data when enqueued from createNotification(): full notification row (id, userId, type, title, message, actionUrl, campaignId, ...). */
function isFullNotification(
  data: unknown
): data is {
  userId: string;
  title: string;
  message: string;
  type: string;
  actionUrl?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  influencerName?: string | null;
} {
  return (
    typeof data === 'object' &&
    data !== null &&
    'userId' in data &&
    'title' in data &&
    'message' in data &&
    typeof (data as Record<string, unknown>).userId === 'string' &&
    typeof (data as Record<string, unknown>).title === 'string' &&
    typeof (data as Record<string, unknown>).message === 'string'
  );
}

export async function processNotificationJob(job: Job) {
  const { data } = job;

  try {
    if (data.action === 'log') {
      console.log('Background notification task processed for:', data.userId);
    }

    // Legacy path: create record in worker and send FCM (no longer used by createNotification)
    if (data.action === 'create') {
      await db.insert(notifications).values({
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        campaignId: data.campaignId,
        influencerId: data.influencerId,
        actionUrl: data.actionUrl,
      });
      const tokens = await getTokensForUser(data.userId);
      if (tokens.length > 0) {
        const fcmData: Record<string, string> = {
          type: data.type,
          actionUrl: data.actionUrl || '',
        };
        if (data.type === 'chat' && data.actionUrl) {
          const conversationId = parseConversationIdFromActionUrl(data.actionUrl, data.type);
          if (conversationId) fcmData.conversationId = conversationId;
        }
        const result = await sendPushNotification(
          tokens,
          data.title,
          data.message,
          fcmData,
          notificationCategory(data.type)
        );
        if (result?.invalidTokens.length) {
          for (const t of result.invalidTokens) await unregisterFcmToken(t);
        }
      }
      return;
    }

    // Normal path: notification already saved and emitted via WS; send FCM to device tokens
    if (isFullNotification(data)) {
      const tokens = await getTokensForUser(data.userId);
      if (tokens.length > 0) {
        const fcmData: Record<string, string> = {
          type: data.type,
          actionUrl: data.actionUrl || '',
        };

        // Chat: extract conversationId from actionUrl for direct navigation on tap
        if (data.type === 'chat' && data.actionUrl) {
          const conversationId = parseConversationIdFromActionUrl(data.actionUrl, data.type);
          if (conversationId) fcmData.conversationId = conversationId;
        }

        // All campaign-related types: include campaignId and campaignName for navigation
        const isCampaignType = ['application', 'campaign_invite', 'negotiation', 'script', 'submission'].includes(data.type);
        if (isCampaignType && data.campaignId) {
          fcmData.campaignId = data.campaignId;
        }
        if (data.campaignName) {
          fcmData.campaignName = data.campaignName;
        }

        const result = await sendPushNotification(
          tokens,
          data.title,
          data.message,
          fcmData,
          notificationCategory(data.type)
        );
        if (result?.invalidTokens.length) {
          for (const t of result.invalidTokens) await unregisterFcmToken(t);
        }
      }
    }
  } catch (error) {
    console.error('Notification processing failed', error);
    throw error;
  }
}
