import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { socialConnections, influencerProfiles } from '@/db/schema';
import { env } from '@/config/env';
import { BadRequestError, AppError, NotFoundError } from '@/shared/errors';
import { encryptToken } from '@/shared/utils/crypto';
import type { ConnectSocialDTO, DisconnectSocialDTO } from './social.schema';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// ─── Tier derivation (matches ProfileScreen.tsx thresholds) ──────────────────

function deriveTier(followers: number): 'nano' | 'micro' | 'mid' | 'macro' | 'mega' {
  if (followers >= 1_000_000) return 'mega';
  if (followers >= 500_000) return 'macro';
  if (followers >= 50_000) return 'mid';
  if (followers >= 10_000) return 'micro';
  return 'nano';
}

// ─── Graph API helpers ────────────────────────────────────────────────────────

async function graphGet<T>(path: string, accessToken: string): Promise<T> {
  const url = `${GRAPH_API}${path}${path.includes('?') ? '&' : '?'}access_token=${accessToken}`;
  const res = await fetch(url);

  if (res.status === 429) {
    throw new AppError('RATE_LIMITED', 'Instagram API rate limit reached — please try again in a few minutes.', 429);
  }

  const data = (await res.json()) as T & { error?: { message: string; code: number } };

  if (!res.ok || (data as any).error) {
    const msg = (data as any).error?.message ?? 'Graph API request failed';
    throw new BadRequestError(msg);
  }

  return data;
}

// ─── Token exchange: short-lived → long-lived (60 days) ──────────────────────

interface TokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{ token: string; expiry: Date }> {
  let res: Response;
  try {
    res = await fetch(
      `${GRAPH_API}/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${env.META_APP_ID}` +
        `&client_secret=${env.META_APP_SECRET}` +
        `&fb_exchange_token=${shortLivedToken}`,
    );
  } catch {
    throw new BadRequestError('Token exchange failed — please check your connection and try again.');
  }

  if (!res.ok) {
    const body = (await res.json()) as { error?: { message: string } };
    throw new BadRequestError(body.error?.message ?? 'Token exchange failed — please try again.');
  }

  const data = (await res.json()) as TokenExchangeResponse;
  const expiry = new Date(Date.now() + data.expires_in * 1000);
  return { token: data.access_token, expiry };
}

// ─── Fetch Instagram Business Account linked to the user's Pages ─────────────

interface PageAccount {
  id: string;
  name: string;
  instagram_business_account?: { id: string };
}

interface AccountsResponse {
  data: PageAccount[];
}

interface IGUserResponse {
  id: string;
  username: string;
  followers_count: number;
  media_count: number;
}

interface MediaItem {
  like_count: number;
  comments_count: number;
}

interface MediaResponse {
  data: MediaItem[];
}

async function fetchInstagramAccount(longLivedToken: string): Promise<{
  igUserId: string;
  igUsername: string;
  followerCount: number;
  mediaCount: number;
  pageId: string;
}> {
  // Step 1: Get managed Facebook Pages
  const accounts = await graphGet<AccountsResponse>(
    '/me/accounts?fields=id,name,instagram_business_account{id}',
    longLivedToken,
  );

  if (!accounts.data || accounts.data.length === 0) {
    throw new BadRequestError(
      'No Facebook Page is linked to your account. Please link a Page to your Instagram in Meta Business Suite, then reconnect.',
    );
  }

  // Step 2: Find first page with a linked Instagram Business Account
  const pageWithIG = accounts.data.find((p) => p.instagram_business_account?.id);

  if (!pageWithIG || !pageWithIG.instagram_business_account) {
    throw new BadRequestError(
      'Your Instagram account must be a Business or Creator account to connect. Go to Instagram Settings → Account → Switch to Professional Account, then reconnect.',
    );
  }

  const igUserId = pageWithIG.instagram_business_account.id;
  const pageId = pageWithIG.id;

  // Step 3: Fetch IG user details
  const igUser = await graphGet<IGUserResponse>(
    `/${igUserId}?fields=id,username,followers_count,media_count`,
    longLivedToken,
  );

  return {
    igUserId,
    igUsername: igUser.username,
    followerCount: igUser.followers_count ?? 0,
    mediaCount: igUser.media_count ?? 0,
    pageId,
  };
}

// ─── Fetch recent media to calculate engagement rate ─────────────────────────

async function calculateEngagementRate(
  igUserId: string,
  followerCount: number,
  longLivedToken: string,
): Promise<{ engagementRate: number; avgLikes: number; avgComments: number }> {
  const media = await graphGet<MediaResponse>(
    `/${igUserId}/media?fields=like_count,comments_count&limit=12`,
    longLivedToken,
  );

  if (!media.data || media.data.length === 0) {
    return { engagementRate: 0, avgLikes: 0, avgComments: 0 };
  }

  const totalLikes = media.data.reduce((sum, m) => sum + (m.like_count ?? 0), 0);
  const totalComments = media.data.reduce((sum, m) => sum + (m.comments_count ?? 0), 0);
  const postCount = media.data.length;

  const avgLikes = Math.round(totalLikes / postCount);
  const avgComments = Math.round(totalComments / postCount);

  // Guard against 0 followers
  const engagementRate =
    followerCount > 0
      ? Math.round(((totalLikes + totalComments) / postCount / followerCount) * 100 * 100) / 100
      : 0;

  return { engagementRate, avgLikes, avgComments };
}

// ─── Public service functions ─────────────────────────────────────────────────

export async function connectSocial(userId: string, dto: ConnectSocialDTO) {
  if (dto.platform !== 'instagram') {
    throw new BadRequestError(`Platform '${dto.platform}' is not yet supported.`);
  }

  // 1. Exchange short-lived token for long-lived (60 days)
  const { token: longLivedToken, expiry: tokenExpiry } = await exchangeForLongLivedToken(dto.accessToken);

  // 2. Fetch Instagram Business Account details
  const { igUserId, igUsername, followerCount, mediaCount, pageId } =
    await fetchInstagramAccount(longLivedToken);

  // 3. Calculate engagement rate from recent posts
  const { engagementRate, avgLikes, avgComments } = await calculateEngagementRate(
    igUserId,
    followerCount,
    longLivedToken,
  );

  // 4. Encrypt token before storing
  const encryptedToken = encryptToken(longLivedToken);

  // 5. Upsert social_connections row
  await db
    .insert(socialConnections)
    .values({
      userId,
      platform: 'instagram',
      platformUserId: igUserId,
      platformHandle: igUsername,
      accessToken: encryptedToken,
      refreshToken: null,
      tokenExpiry,
      followerCount,
      engagementRate: String(engagementRate),
      isConnected: true,
      metadata: { pageId, avgLikes, avgComments, mediaCount },
    })
    .onConflictDoUpdate({
      target: [socialConnections.userId, socialConnections.platform],
      set: {
        platformUserId: igUserId,
        platformHandle: igUsername,
        accessToken: encryptedToken,
        refreshToken: null,
        tokenExpiry,
        followerCount,
        engagementRate: String(engagementRate),
        isConnected: true,
        metadata: { pageId, avgLikes, avgComments, mediaCount },
        updatedAt: new Date(),
      },
    });

  // 6. Update influencer_profiles with verified data
  const tier = deriveTier(followerCount);

  await db
    .update(influencerProfiles)
    .set({
      handle: igUsername,
      followerCount,
      engagementRate: String(engagementRate),
      tier,
      platforms: [{ platform: 'instagram', handle: igUsername, followers: followerCount }],
      updatedAt: new Date(),
    })
    .where(eq(influencerProfiles.userId, userId));

  return {
    platform: 'instagram',
    platformHandle: igUsername,
    followerCount,
    engagementRate: String(engagementRate),
    isConnected: true,
    tokenExpiry: tokenExpiry.toISOString(),
    isExpired: false,
    metadata: { pageId, avgLikes, avgComments, mediaCount },
  };
}

export async function disconnectSocial(userId: string, dto: DisconnectSocialDTO) {
  // Idempotent: succeeds even if no row exists or token is already expired
  await db
    .update(socialConnections)
    .set({
      isConnected: false,
      accessToken: null,
      tokenExpiry: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(socialConnections.userId, userId),
        eq(socialConnections.platform, dto.platform),
      ),
    );
  // Note: followerCount/handle in influencer_profiles are intentionally kept
  // so brands who viewed the profile still see the stats.
}

export async function getSocialStatus(userId: string) {
  const rows = await db
    .select({
      platform: socialConnections.platform,
      platformHandle: socialConnections.platformHandle,
      followerCount: socialConnections.followerCount,
      engagementRate: socialConnections.engagementRate,
      isConnected: socialConnections.isConnected,
      tokenExpiry: socialConnections.tokenExpiry,
      metadata: socialConnections.metadata,
    })
    .from(socialConnections)
    .where(eq(socialConnections.userId, userId));

  const now = new Date();

  const buildEntry = (row: (typeof rows)[number]) => ({
    platform: row.platform,
    platformHandle: row.platformHandle,
    followerCount: row.followerCount,
    engagementRate: row.engagementRate,
    isConnected: row.isConnected,
    tokenExpiry: row.tokenExpiry?.toISOString() ?? null,
    isExpired: row.tokenExpiry ? row.tokenExpiry < now : false,
    metadata: row.metadata,
  });

  const result: Record<string, ReturnType<typeof buildEntry> | null> = {
    instagram: null,
    youtube: null,
    twitter: null,
  };

  for (const row of rows) {
    result[row.platform] = buildEntry(row);
  }

  return result;
}
