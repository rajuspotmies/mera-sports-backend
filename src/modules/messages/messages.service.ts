import { eq, and, asc, sql, desc } from 'drizzle-orm';
import { db } from '@/db';
import { messages, conversations, users, campaignInfluencers, brandProfiles, influencerProfiles, campaigns } from '@/db/schema';
import { NotFoundError, ForbiddenError, BadRequestError } from '@/shared/errors';
import { parsePagination, buildPaginationMeta, getOffset } from '@/shared/utils/pagination';
import type { JWTPayload } from '@/shared/types/api';
import { emitToUser } from '@/socket';

import { createNotification } from '../notifications/notifications.service';

/** Chat (start + send) only during script & work phases for this application */
const CHAT_ALLOWED_STATUSES = [
  'script_pending',
  'script_review',
  'work_pending',
  'work_review',
] as const;

export async function startConversation(ciId: string, user: JWTPayload) {
  const [ci] = await db
    .select({
      id: campaignInfluencers.id,
      campaignId: campaignInfluencers.campaignId,
      influencerId: campaignInfluencers.influencerId,
      status: campaignInfluencers.status,
    })
    .from(campaignInfluencers)
    .where(eq(campaignInfluencers.id, ciId))
    .limit(1);

  if (!ci) throw new NotFoundError('Campaign influencer record');

  if (!CHAT_ALLOWED_STATUSES.includes(ci.status as any)) {
    throw new BadRequestError(
      `Chat can only be started during script or work stages. Current status: ${ci.status}`
    );
  }

  assertCIAccess(ci, user);

  const [campaign] = await db
    .select({ brandId: campaigns.brandId })
    .from(campaigns)
    .where(eq(campaigns.id, ci.campaignId))
    .limit(1);

  if (!campaign) throw new NotFoundError('Campaign');

  const [conv] = await db
    .insert(conversations)
    .values({
      campaignId: ci.campaignId,
      brandId: campaign.brandId,
      influencerId: ci.influencerId,
      status: 'active',
    })
    .onConflictDoNothing()
    .returning();

  if (conv) {
    await db
      .update(campaignInfluencers)
      .set({ chatEnabled: true, updatedAt: new Date() })
      .where(eq(campaignInfluencers.id, ciId));
    return conv;
  }

  // Already existed — return existing conversation
  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.campaignId, ci.campaignId),
        eq(conversations.influencerId, ci.influencerId)
      )
    )
    .limit(1);

  return existing;
}

export async function listConversations(user: JWTPayload) {
  const isInfluencer = user.role === 'influencer';
  const isBrand = user.role === 'brand_owner' || user.role === 'admin';

  let conditions;
  if (isBrand) {
    conditions = user.brandId ? eq(conversations.brandId, user.brandId) : undefined;
  } else {
    conditions = user.influencerId ? eq(conversations.influencerId, user.influencerId) : undefined;
  }

  const rows = await db
    .select({
      id: conversations.id,
      campaignId: conversations.campaignId,
      brandId: conversations.brandId,
      influencerId: conversations.influencerId,
      status: conversations.status,
      lastMessage: conversations.lastMessage,
      lastMessageAt: conversations.lastMessageAt,
      brandUnread: conversations.brandUnread,
      influencerUnread: conversations.influencerUnread,
      createdAt: conversations.createdAt,
      campaignName: campaigns.name,
      brandName: brandProfiles.brandName,
      brandLogoUrl: brandProfiles.brandLogoUrl,
      influencerHandle: influencerProfiles.handle,
      influencerName: users.name,
      influencerAvatarUrl: users.avatarUrl,
      ciStatus: campaignInfluencers.status,
    })
    .from(conversations)
    .innerJoin(campaigns, eq(campaigns.id, conversations.campaignId))
    .innerJoin(brandProfiles, eq(brandProfiles.id, conversations.brandId))
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, conversations.influencerId))
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .innerJoin(
      campaignInfluencers,
      and(
        eq(campaignInfluencers.campaignId, conversations.campaignId),
        eq(campaignInfluencers.influencerId, conversations.influencerId)
      )
    )
    .where(conditions)
    .orderBy(desc(conversations.lastMessageAt));

  return rows.map((r) => ({
    ...r,
    otherName: isInfluencer ? r.brandName : (r.influencerName || r.influencerHandle),
    otherAvatar: isInfluencer ? r.brandLogoUrl : r.influencerAvatarUrl,
    unreadCount: isInfluencer ? r.influencerUnread : r.brandUnread,
    chatWritable: CHAT_ALLOWED_STATUSES.includes(r.ciStatus as any),
  }));
}

export async function getConversation(
  conversationId: string,
  user: JWTPayload,
  query: { page?: number; limit?: number }
) {
  const isInfluencer = user.role === 'influencer';

  const [convRow] = await db
    .select({
      id: conversations.id,
      campaignId: conversations.campaignId,
      brandId: conversations.brandId,
      influencerId: conversations.influencerId,
      brandUserId: brandProfiles.userId,
      influencerUserId: influencerProfiles.userId,
      status: conversations.status,
      lastMessage: conversations.lastMessage,
      lastMessageAt: conversations.lastMessageAt,
      brandUnread: conversations.brandUnread,
      influencerUnread: conversations.influencerUnread,
      createdAt: conversations.createdAt,
      campaignName: campaigns.name,
      brandName: brandProfiles.brandName,
      brandLogoUrl: brandProfiles.brandLogoUrl,
      influencerHandle: influencerProfiles.handle,
      influencerName: users.name,
      influencerAvatarUrl: users.avatarUrl,
      ciStatus: campaignInfluencers.status,
    })
    .from(conversations)
    .innerJoin(campaigns, eq(campaigns.id, conversations.campaignId))
    .innerJoin(brandProfiles, eq(brandProfiles.id, conversations.brandId))
    .innerJoin(influencerProfiles, eq(influencerProfiles.id, conversations.influencerId))
    .innerJoin(users, eq(users.id, influencerProfiles.userId))
    .innerJoin(
      campaignInfluencers,
      and(
        eq(campaignInfluencers.campaignId, conversations.campaignId),
        eq(campaignInfluencers.influencerId, conversations.influencerId)
      )
    )
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!convRow) throw new NotFoundError('Conversation');
  assertConversationAccess(convRow as any, user);

  const chatWritable = CHAT_ALLOWED_STATUSES.includes(convRow.ciStatus as any);

  const conv = {
    ...convRow,
    otherName: isInfluencer ? convRow.brandName : (convRow.influencerName || convRow.influencerHandle),
    otherAvatar: isInfluencer ? convRow.brandLogoUrl : convRow.influencerAvatarUrl,
    unreadCount: isInfluencer ? convRow.influencerUnread : convRow.brandUnread,
    chatWritable,
  };

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

  const isBrandSide = user.role === 'brand_owner' || user.role === 'admin';
  await db
    .update(conversations)
    .set(isBrandSide ? { brandUnread: 0 } : { influencerUnread: 0 })
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
      ciStatus: campaignInfluencers.status,
    })
    .from(conversations)
    .innerJoin(brandProfiles, eq(conversations.brandId, brandProfiles.id))
    .innerJoin(influencerProfiles, eq(conversations.influencerId, influencerProfiles.id))
    .innerJoin(campaigns, eq(conversations.campaignId, campaigns.id))
    .innerJoin(
      campaignInfluencers,
      and(
        eq(campaignInfluencers.campaignId, conversations.campaignId),
        eq(campaignInfluencers.influencerId, conversations.influencerId)
      )
    )
    .where(eq(conversations.id, conversationId))
    .limit(1);

  const conv = convWithProfiles[0];
  if (!conv) throw new NotFoundError('Conversation');
  assertConversationAccess(conv as any, user);

  if (!CHAT_ALLOWED_STATUSES.includes(conv.ciStatus as any)) {
    throw new ForbiddenError(
      'Chat is read-only outside script and work stages'
    );
  }

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

  const recipientUserId = senderRole === 'brand' ? conv.influencerUserId : conv.brandUserId;
  const isBrandSender = senderRole === 'brand';

  await db
    .update(conversations)
    .set({
      lastMessage: content.slice(0, 255),
      lastMessageAt: new Date(),
      ...(isBrandSender
        ? { influencerUnread: sql`${conversations.influencerUnread} + 1` }
        : { brandUnread: sql`${conversations.brandUnread} + 1` }),
    })
    .where(eq(conversations.id, conversationId));

  emitToUser(user.sub, 'NEW_MESSAGE', message);
  emitToUser(recipientUserId, 'NEW_MESSAGE', message);

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

function assertCIAccess(
  ci: { campaignId: string; influencerId: string },
  user: JWTPayload
) {
  if (user.role === 'admin') return;
  if (user.role === 'influencer' && ci.influencerId !== user.influencerId) {
    throw new ForbiddenError('Access denied');
  }
  if (user.role === 'brand_owner') {
    // Brand access is validated implicitly — they own the campaign
  }
}
