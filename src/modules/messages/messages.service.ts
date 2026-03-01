import { eq, and, asc, sql, desc } from 'drizzle-orm';
import { db } from '@/db';
import { messages, conversations, users, campaignInfluencers } from '@/db/schema';
import { NotFoundError, ForbiddenError } from '@/shared/errors';
import { parsePagination, buildPaginationMeta, getOffset } from '@/shared/utils/pagination';
import type { JWTPayload } from '@/shared/types/api';

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
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv) throw new NotFoundError('Conversation');
  assertConversationAccess(conv, user);

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
  await db
    .update(conversations)
    .set({
      lastMessage: content.slice(0, 255),
      lastMessageAt: new Date(),
      [unreadField]: sql`${conversations[unreadField as keyof typeof conversations]} + 1`,
    })
    .where(eq(conversations.id, conversationId));

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
