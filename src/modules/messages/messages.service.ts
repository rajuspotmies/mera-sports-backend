import { eq, and, asc, sql, desc } from 'drizzle-orm';
import { db } from '@/db';
import { messages, conversations, users, campaignInfluencers, brandProfiles, influencerProfiles, campaigns } from '@/db/schema';
import { NotFoundError, ForbiddenError } from '@/shared/errors';
import { parsePagination, buildPaginationMeta, getOffset } from '@/shared/utils/pagination';
import type { JWTPayload } from '@/shared/types/api';
import { emitToUser } from '@/socket';

import { createNotification } from '../notifications/notifications.service';

export async function listConversations(user: JWTPayload) {
  let conditions;
  if (user.role === 'brand_owner' || user.role === 'admin') {
    conditions = user.brandId ? eq(conversations.brandId, user.brandId) : undefined;
  } else {
    conditions = user.influencerId ? eq(conversations.influencerId, user.influencerId) : undefined;
  }

  const rows = await db
    .select()
    .from(conversations)
    .where(conditions)
    .orderBy(desc(conversations.lastMessageAt));

  return rows;
}

export async function getConversation(
  conversationId: string,
  user: JWTPayload,
  query: { page?: number; limit?: number }
) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv) throw new NotFoundError('Conversation');
  assertConversationAccess(conv, user);

  const { page, limit } = parsePagination(query);
  const offset = getOffset({ page, limit });

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.conversationId, conversationId));

  // Mark as read
  const unreadField =
    user.role === 'brand_owner' || user.role === 'admin' ? 'brand_unread' : 'influencer_unread';
  await db
    .update(conversations)
    .set({ [unreadField]: 0 })
    .where(eq(conversations.id, conversationId));

  return {
    conversation: conv,
    messages: msgs,
    meta: buildPaginationMeta(count, { page, limit }),
  };
}

export async function sendMessage(
  conversationId: string,
  user: JWTPayload,
  content: string
) {
  const convWithProfiles = await db
    .select({
      id: conversations.id,
      campaignId: conversations.campaignId,
      brandId: conversations.brandId,
      influencerId: conversations.influencerId,
      brandUserId: brandProfiles.userId,
      influencerUserId: influencerProfiles.userId,
      campaignName: campaigns.name,
    })
    .from(conversations)
    .innerJoin(brandProfiles, eq(conversations.brandId, brandProfiles.id))
    .innerJoin(influencerProfiles, eq(conversations.influencerId, influencerProfiles.id))
    .innerJoin(campaigns, eq(conversations.campaignId, campaigns.id))
    .where(eq(conversations.id, conversationId))
    .limit(1);

  const conv = convWithProfiles[0];
  if (!conv) throw new NotFoundError('Conversation');
  assertConversationAccess(conv as any, user);

  const [sender] = await db.select({ name: users.name }).from(users).where(eq(users.id, user.sub)).limit(1);

  const senderRole = user.role === 'brand_owner' || user.role === 'admin' ? 'brand' : 'influencer';

  const [message] = await db
    .insert(messages)
    .values({
      conversationId,
      senderId: user.sub,
      senderRole,
      content,
    })
    .returning();

  // Update conversation snippet + unread for the OTHER party
  const unreadField = senderRole === 'brand' ? 'influencer_unread' : 'brand_unread';
  const recipientUserId = senderRole === 'brand' ? conv.influencerUserId : conv.brandUserId;

  await db
    .update(conversations)
    .set({
      lastMessage: content.slice(0, 255),
      lastMessageAt: new Date(),
      [unreadField]: sql`${conversations[unreadField as keyof typeof conversations]} + 1`,
    })
    .where(eq(conversations.id, conversationId));

  // ─── Real-time emission ───────────────────────────────────────────────────
  // 1. Emit to the sender (to confirm across their own tabs)
  emitToUser(user.sub, 'NEW_MESSAGE', message);

  // 2. Emit to the recipient
  emitToUser(recipientUserId, 'NEW_MESSAGE', message);

  // ─── Trigger Notification ─────────────────────────────────────────────────
  await createNotification({
    userId: recipientUserId,
    type: 'chat',
    title: `New message from ${sender?.name || 'Someone'}`,
    message: content.length > 100 ? `${content.slice(0, 97)}...` : content,
    campaignId: conv.campaignId,
    campaignName: conv.campaignName,
    actionUrl: `/messages?id=${conversationId}`,
  });

  return message;
}

function assertConversationAccess(conv: typeof conversations.$inferSelect, user: JWTPayload) {
  if (user.role === 'admin') return;
  if (user.role === 'brand_owner' && conv.brandId !== user.brandId) {
    throw new ForbiddenError('Access denied to this conversation');
  }
  if (user.role === 'influencer' && conv.influencerId !== user.influencerId) {
    throw new ForbiddenError('Access denied to this conversation');
  }
}
