import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import type { NewNotification } from '@/db/schema';
import { parsePagination, buildPaginationMeta, getOffset } from '@/shared/utils/pagination';
import { emitToUser } from '@/socket';
import { notificationQueue, emailQueue } from '@/jobs/queue';
import { fcmTokens } from '@/db/schema';

// ─── Create & emit ────────────────────────────────────────────────────────────

export async function createNotification(data: Omit<NewNotification, 'id' | 'createdAt'>) {
  const [notification] = await db.insert(notifications).values(data).returning();

  // Real-time emission to the target user
  emitToUser(data.userId, 'NOTIFICATION', notification);

  // Queue background tasks
  await notificationQueue.add('process-notification', notification);
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

  return {
    notifications: rows,
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
