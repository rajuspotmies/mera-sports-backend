import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import type { NewNotification } from '@/db/schema';
import { parsePagination, buildPaginationMeta, getOffset } from '@/shared/utils/pagination';
import { emitToUser } from '@/socket';
import { notificationQueue, emailQueue } from '@/jobs/queue';
import { fcmTokens } from '@/db/schema';
import { sendPushNotification } from '@/shared/services/fcm.service';

/** Parse conversationId from chat actionUrl (e.g. /messages?id=xxx or mutinytalent://chat?conversationId=xxx). */
export function parseConversationIdFromActionUrl(
  actionUrl: string | null | undefined,
  type: string
): string | undefined {
  if (type !== 'chat' || !actionUrl) return undefined;
  try {
    const url = new URL(actionUrl.startsWith('http') ? actionUrl : actionUrl, 'https://dummy.com');
    return url.searchParams.get('id') || url.searchParams.get('conversationId') || undefined;
  } catch {
    return undefined;
  }
}

// ─── Create & emit ────────────────────────────────────────────────────────────

export async function createNotification(data: Omit<NewNotification, 'id' | 'createdAt'>) {
  const [notification] = await db.insert(notifications).values(data).returning();

  // Real-time emission to the target user (matches frontend WS_EVENTS.NOTIFICATION)
  emitToUser(data.userId, 'notification:new', notification);

  // Queue background tasks (production-grade async delivery path)
  await notificationQueue.add('process-notification', notification, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  });

  await emailQueue.add('send-email', {
    userId: data.userId,
    type: data.type,
    title: data.title,
    message: data.message,
  });

  return notification;
}

// ─── List notifications for user ─────────────────────────────────────────────

export async function listNotifications(
  userId: string,
  query: { page?: number; limit?: number; unreadOnly?: string }
) {
  const { page, limit } = parsePagination(query);
  const offset = getOffset({ page, limit });

  const conditions = [eq(notifications.userId, userId)];
  if (query.unreadOnly === 'true') {
    conditions.push(eq(notifications.isRead, false));
  }

  const where = and(...conditions);

  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(where);

  const [{ unreadCount }] = await db
    .select({ unreadCount: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

  // Add conversationId for chat; for campaign_invite add accept/decline action URLs for in-app and push action buttons
  const notificationsWithConversationId = rows.map((row) => {
    const conversationId =
      row.type === 'chat' ? parseConversationIdFromActionUrl(row.actionUrl, row.type) : undefined;
    const base = { ...row, conversationId };
    if (row.type === 'campaign_invite' && row.campaignId) {
      return {
        ...base,
        acceptInviteUrl: `/campaigns/${row.campaignId}/applications/accept-invite`,
        declineInviteUrl: `/campaigns/${row.campaignId}/applications/decline-invite`,
      };
    }
    return base;
  });

  return {
    notifications: notificationsWithConversationId,
    meta: buildPaginationMeta(count, { page, limit }),
    unreadCount,
  };
}

export async function markNotificationRead(notificationId: string, userId: string) {
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning();
  return updated;
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId));
}

// ─── FCM Token Management ───────────────────────────────────────────────────

export async function registerFcmToken(userId: string, token: string, deviceType?: string) {
  await db
    .insert(fcmTokens)
    .values({
      userId,
      token,
      deviceType,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: fcmTokens.token,
      set: {
        userId,
        deviceType,
        updatedAt: new Date(),
      },
    });
}

export async function unregisterFcmToken(token: string) {
  await db.delete(fcmTokens).where(eq(fcmTokens.token, token));
}

export async function getTokensForUser(userId: string) {
  const tokens = await db
    .select({ token: fcmTokens.token })
    .from(fcmTokens)
    .where(eq(fcmTokens.userId, userId));
  return tokens.map((t) => t.token);
}

/** Send a one-off test push notification to all FCM tokens registered for the user. Invalid tokens are removed from the DB. */
export async function sendTestNotification(userId: string) {
  const tokens = await getTokensForUser(userId);
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, invalidTokensRemoved: 0, message: 'No FCM tokens registered for this user' };
  }
  const result = await sendPushNotification(
    tokens,
    'Test notification',
    'This is a test push from Mutiny. If you see this, FCM is working.',
    { type: 'system', actionUrl: '/notifications' }
  );
  const invalidTokens = result?.invalidTokens ?? [];
  for (const token of invalidTokens) {
    await unregisterFcmToken(token);
  }
  return {
    sent: result?.successCount ?? 0,
    failed: result?.failureCount ?? 0,
    invalidTokensRemoved: invalidTokens.length,
    message: `Test push sent to ${result?.successCount ?? 0} device(s).${invalidTokens.length ? ` ${invalidTokens.length} invalid token(s) removed.` : ''}`,
  };
}
