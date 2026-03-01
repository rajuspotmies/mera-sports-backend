import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '@/db';
import { users, brandProfiles, influencerProfiles, refreshTokens } from '@/db/schema';
import { env } from '@/config/env';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
} from '@/shared/errors';
import type { JWTPayload } from '@/shared/types/api';
import type { RegisterDTO, LoginDTO } from './auth.schema';

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

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      brandId,
      influencerId,
    },
  };
}

export async function login(dto: LoginDTO) {
  const [user] = await db.select().from(users).where(eq(users.email, dto.email)).limit(1);

  if (!user || !user.isActive) {
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

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      brandId,
      influencerId,
    },
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

  return { accessToken, refreshToken: newRefreshToken };
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
      profile = { brandId: brand.id, brandName: brand.brandName, brandLogoUrl: brand.brandLogoUrl, industry: brand.industry, website: brand.website };
    }
  } else if (user.role === 'influencer') {
    const [influencer] = await db
      .select()
      .from(influencerProfiles)
      .where(eq(influencerProfiles.userId, userId))
      .limit(1);
    if (influencer) {
      profile = { influencerId: influencer.id, handle: influencer.handle, tier: influencer.tier, followerCount: influencer.followerCount };
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
