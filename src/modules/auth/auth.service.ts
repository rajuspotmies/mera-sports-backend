import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { eq, and, gt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users, brandProfiles, influencerProfiles, refreshTokens, campaigns, campaignInfluencers } from '@/db/schema';
import { env } from '@/config/env';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
} from '@/shared/errors';
import type { JWTPayload } from '@/shared/types/api';
import type { RegisterDTO, LoginDTO, UpdateMeDTO } from './auth.schema';

// ─── Token helpers ─────────────────────────────────────────────────────────

function signAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function parseRefreshExpiry(): Date {
  // Default: 30 days
  const days = parseInt(env.REFRESH_TOKEN_EXPIRES_IN, 10) || 30;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function createRefreshToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = parseRefreshExpiry();

  await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt });
  return rawToken;
}

// ─── Auth Service ───────────────────────────────────────────────────────────

export async function register(dto: RegisterDTO) {
  // Check email uniqueness
  const existing = await db.select().from(users).where(eq(users.email, dto.email)).limit(1);
  if (existing.length > 0) {
    throw new ConflictError('Email is already registered');
  }

  const passwordHash = await bcrypt.hash(dto.password, 12);

  const [user] = await db
    .insert(users)
    .values({
      email: dto.email,
      passwordHash,
      name: dto.name,
      role: dto.role,
    })
    .returning();

  let brandId: string | undefined;
  let influencerId: string | undefined;

  if (dto.role === 'brand_owner') {
    const [brand] = await db
      .insert(brandProfiles)
      .values({
        userId: user.id,
        brandName: dto.brandName ?? dto.name,
        industry: dto.industry,
      })
      .returning();
    brandId = brand.id;
  } else {
    const [influencer] = await db
      .insert(influencerProfiles)
      .values({
        userId: user.id,
        handle: dto.handle,
      })
      .returning();
    influencerId = influencer.id;
  }

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    ...(brandId && { brandId }),
    ...(influencerId && { influencerId }),
  });
  const refreshToken = await createRefreshToken(user.id);

  const userPayload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    brandId,
    influencerId,
    ...(dto.role === 'brand_owner' ? {
      brandName: dto.brandName ?? dto.name,
      industry: dto.industry,
    } : {
      handle: dto.handle,
    }),
  };

  return {
    accessToken,
    refreshToken,
    user: userPayload,
  };
}

export async function login(dto: LoginDTO) {
  const [user] = await db.select().from(users).where(eq(users.email, dto.email)).limit(1);

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
  if (!passwordMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Load profile IDs
  let brandId: string | undefined;
  let influencerId: string | undefined;

  if (user.role === 'brand_owner') {
    const [brand] = await db
      .select({ id: brandProfiles.id })
      .from(brandProfiles)
      .where(eq(brandProfiles.userId, user.id))
      .limit(1);
    brandId = brand?.id;
  } else if (user.role === 'influencer') {
    const [influencer] = await db
      .select({ id: influencerProfiles.id })
      .from(influencerProfiles)
      .where(eq(influencerProfiles.userId, user.id))
      .limit(1);
    influencerId = influencer?.id;
  }

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    ...(brandId && { brandId }),
    ...(influencerId && { influencerId }),
  });
  const refreshToken = await createRefreshToken(user.id);

  const [userProfile]: any[] = user.role === 'brand_owner'
    ? await db.select().from(brandProfiles).where(eq(brandProfiles.id, brandId!)).limit(1)
    : user.role === 'influencer'
      ? await db.select().from(influencerProfiles).where(eq(influencerProfiles.id, influencerId!)).limit(1)
      : [null];

  const userPayload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    brandId,
    influencerId,
    ...(user.role === 'brand_owner' && userProfile ? {
      brandName: userProfile.brandName,
      brandType: userProfile.brandType,
      brandLogoUrl: userProfile.brandLogoUrl,
      industry: userProfile.industry,
      website: userProfile.website,
      city: userProfile.city,
      primaryLanguage: userProfile.primaryLanguage,
      otherLanguages: userProfile.otherLanguages,
      bio: userProfile.description, // Map description to bio for frontend
    } : {}),
    ...(user.role === 'influencer' && userProfile ? {
      handle: userProfile.handle,
      bio: userProfile.bio,
      location: userProfile.location,
      niches: userProfile.niches,
      tier: userProfile.tier,
      followerCount: userProfile.followerCount,
    } : {}),
  };

  return {
    accessToken,
    refreshToken,
    user: userPayload,
  };
}

export async function refresh(rawToken: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        gt(refreshTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!stored) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Rotate — delete old token
  await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

  const [user] = await db.select().from(users).where(eq(users.id, stored.userId)).limit(1);
  if (!user || !user.isActive) throw new UnauthorizedError('User not found or inactive');

  let brandId: string | undefined;
  let influencerId: string | undefined;

  if (user.role === 'brand_owner') {
    const [brand] = await db
      .select({ id: brandProfiles.id })
      .from(brandProfiles)
      .where(eq(brandProfiles.userId, user.id))
      .limit(1);
    brandId = brand?.id;
  } else if (user.role === 'influencer') {
    const [influencer] = await db
      .select({ id: influencerProfiles.id })
      .from(influencerProfiles)
      .where(eq(influencerProfiles.userId, user.id))
      .limit(1);
    influencerId = influencer?.id;
  }

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    ...(brandId && { brandId }),
    ...(influencerId && { influencerId }),
  });
  const newRefreshToken = await createRefreshToken(user.id);

  const [userProfile]: any[] = user.role === 'brand_owner'
    ? await db.select().from(brandProfiles).where(eq(brandProfiles.id, brandId!)).limit(1)
    : user.role === 'influencer'
      ? await db.select().from(influencerProfiles).where(eq(influencerProfiles.id, influencerId!)).limit(1)
      : [null];

  const userPayload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    brandId,
    influencerId,
    ...(user.role === 'brand_owner' && userProfile ? {
      brandName: userProfile.brandName,
      brandType: userProfile.brandType,
      brandLogoUrl: userProfile.brandLogoUrl,
      industry: userProfile.industry,
      website: userProfile.website,
      city: userProfile.city,
      primaryLanguage: userProfile.primaryLanguage,
      otherLanguages: userProfile.otherLanguages,
      bio: userProfile.description,
    } : {}),
    ...(user.role === 'influencer' && userProfile ? {
      handle: userProfile.handle,
      bio: userProfile.bio,
      location: userProfile.location,
      niches: userProfile.niches,
      tier: userProfile.tier,
      followerCount: userProfile.followerCount,
    } : {}),
  };

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: userPayload,
  };
}

export async function logout(rawToken: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
}

export async function getMe(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError('User');

  let profile: Record<string, unknown> = {};

  if (user.role === 'brand_owner') {
    const [brand] = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.userId, userId))
      .limit(1);
    if (brand) {
      profile = {
        brandId: brand.id,
        brandName: brand.brandName,
        brandLogoUrl: brand.brandLogoUrl,
        industry: brand.industry,
        website: brand.website,
        city: brand.city,
        brandType: brand.brandType,
        primaryLanguage: brand.primaryLanguage,
        otherLanguages: brand.otherLanguages,
        bio: brand.description, // Map description to bio
      };
    }
  } else if (user.role === 'influencer') {
    const [influencer] = await db
      .select()
      .from(influencerProfiles)
      .where(eq(influencerProfiles.userId, userId))
      .limit(1);
    if (influencer) {
      profile = {
        influencerId: influencer.id,
        handle: influencer.handle,
        tier: influencer.tier,
        followerCount: influencer.followerCount,
        bio: influencer.bio,
        location: influencer.location,
        niches: influencer.niches,
      };
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    isVerified: user.isVerified,
    ...profile,
  };
}

export async function updateMe(userId: string, dto: UpdateMeDTO) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError('User');

  const updateData: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (dto.name !== undefined) updateData.name = dto.name;

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning();

  return updated;
}

export async function softDeleteUser(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new NotFoundError('User');

  // Check for active collaborations
  const activeStatuses = ['invited', 'applied', 'negotiating', 'accepted', 'payment_pending', 'paid', 'script_pending', 'script_review', 'work_pending', 'work_review'];

  if (user.role === 'brand_owner') {
    const [brand] = await db.select().from(brandProfiles).where(eq(brandProfiles.userId, userId)).limit(1);
    if (brand) {
      const activeCIs = await db
        .select({ id: campaignInfluencers.id })
        .from(campaignInfluencers)
        .innerJoin(campaigns, eq(campaigns.id, campaignInfluencers.campaignId))
        .where(
          and(
            eq(campaigns.brandId, brand.id),
            sql`${campaignInfluencers.status} IN ${activeStatuses}`
          )
        )
        .limit(1);

      if (activeCIs.length > 0) {
        throw new BadRequestError('Cannot delete account with active campaign collaborations. Please resolve or withdraw them first.');
      }
    }
  } else if (user.role === 'influencer') {
    const [influencer] = await db.select().from(influencerProfiles).where(eq(influencerProfiles.userId, userId)).limit(1);
    if (influencer) {
      const activeCIs = await db
        .select({ id: campaignInfluencers.id })
        .from(campaignInfluencers)
        .where(
          and(
            eq(campaignInfluencers.influencerId, influencer.id),
            sql`${campaignInfluencers.status} IN ${activeStatuses}`
          )
        )
        .limit(1);

      if (activeCIs.length > 0) {
        throw new BadRequestError('Cannot delete account while part of active campaign collaborations. Please complete or withdraw from them first.');
      }
    }
  }

  await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, userId));
}
