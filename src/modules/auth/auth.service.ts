import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { eq, and, gt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users, brandProfiles, influencerProfiles, refreshTokens, campaigns, campaignInfluencers, otpCodes } from '@/db/schema';
import { emailQueue } from '@/jobs/queue';
import { env } from '@/config/env';
import { logger } from '@/shared/utils/logger';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
} from '@/shared/errors';
import { sendWhatsAppOTP } from '../notifications/whatsapp.service';
import type { JWTPayload } from '@/shared/types/api';
import type { RegisterDTO, LoginDTO, UpdateMeDTO, SendOtpDTO, VerifyOtpDTO, ForgotPasswordDTO, ResetPasswordDTO } from './auth.schema';

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

  if (!user.passwordHash) {
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
      logoUrl: userProfile.brandLogoUrl,
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
      logoUrl: userProfile.brandLogoUrl,
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
        logoUrl: brand.brandLogoUrl,
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
  if (dto.email !== undefined) updateData.email = dto.email;

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

// ─── OTP Service ─────────────────────────────────────────────────────────────

export async function sendOtp(dto: SendOtpDTO) {
  const phoneNumber = dto.phoneNumber;
  logger.info(`[OTP] Request received for phone: ${phoneNumber}`);

  // App Store / Play Store review account — skip real OTP and WhatsApp
  if (phoneNumber === env.REVIEW_ACCOUNT_PHONE) {
    logger.info(`[OTP] Review account detected — no real OTP sent`);
    return { success: true, message: 'OTP sent successfully' };
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  await db.insert(otpCodes)
    .values({
      phoneNumber,
      code,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: otpCodes.phoneNumber,
      set: { code, expiresAt, createdAt: new Date() },
    });

  try {
    await sendWhatsAppOTP(phoneNumber, code);
  } catch (error) {
    logger.error(`Failed to send OTP to ${phoneNumber} via WhatsApp`, error);
  }

  logger.info(`[DEVDOTP] OTP for ${phoneNumber}: ${code}`);

  return { success: true, message: 'OTP sent successfully' };
}

export async function verifyOtp(dto: VerifyOtpDTO) {
  // Check DB for valid OTP
  const [stored] = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.phoneNumber, dto.phoneNumber),
        eq(otpCodes.code, dto.code),
        gt(otpCodes.expiresAt, new Date())
      )
    )
    .limit(1);

  const isReviewAccount =
    dto.phoneNumber === env.REVIEW_ACCOUNT_PHONE && dto.code === env.REVIEW_ACCOUNT_OTP;

  if (!stored && !isReviewAccount) {
    throw new UnauthorizedError('Invalid or expired OTP code');
  }

  // Check if user exists
  let [user] = await db.select().from(users).where(eq(users.phoneNumber, dto.phoneNumber)).limit(1);

  let brandId: string | undefined;
  let influencerId: string | undefined;

  if (!user) {
    // New user registration (assumed to be influencer for now as per user request context)
    if (!dto.name) {
      throw new BadRequestError('Name is required for new registration');
    }

    [user] = await db.insert(users).values({
      phoneNumber: dto.phoneNumber,
      name: dto.name,
      role: 'influencer',
      isVerified: true,
      email: `${dto.phoneNumber}@temp.mutiny.com`, // Temporary email placeholder
      passwordHash: '', // No password for OTP users
    }).returning();

    const [influencer] = await db.insert(influencerProfiles).values({
      userId: user.id,
    }).returning();
    influencerId = influencer.id;
  } else {
    // Load profile IDs
    if (user.role === 'brand_owner') {
      const [brand] = await db.select({ id: brandProfiles.id }).from(brandProfiles).where(eq(brandProfiles.userId, user.id)).limit(1);
      brandId = brand?.id;
    } else if (user.role === 'influencer') {
      const [influencer] = await db.select({ id: influencerProfiles.id }).from(influencerProfiles).where(eq(influencerProfiles.userId, user.id)).limit(1);
      influencerId = influencer?.id;
    }
  }

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    ...(brandId && { brandId }),
    ...(influencerId && { influencerId }),
  });
  const refreshToken = await createRefreshToken(user.id);

  // Load user payload for response (similar to login)
  const [userProfile]: any[] = user.role === 'brand_owner'
    ? await db.select().from(brandProfiles).where(eq(brandProfiles.userId, user.id)).limit(1)
    : await db.select().from(influencerProfiles).where(eq(influencerProfiles.userId, user.id)).limit(1);

  const userPayload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    phoneNumber: user.phoneNumber,
    brandId,
    influencerId,
    ...(user.role === 'influencer' && userProfile ? {
      handle: userProfile.handle,
      bio: userProfile.bio,
      location: userProfile.location,
    } : {}),
  };

  return {
    accessToken,
    refreshToken,
    user: userPayload,
  };
}

export async function forgotPassword(dto: ForgotPasswordDTO) {
  const [user] = await db.select().from(users).where(eq(users.email, dto.email)).limit(1);
  if (!user || !user.isActive) {
    // Return success message even if email not found to prevent account enumeration
    return { success: true, message: 'If this email is registered, a reset link will be sent.' };
  }

  const resetToken = jwt.sign(
    { sub: user.id, type: 'password-reset' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const frontendUrl = env.FRONTEND_URLS[0] || 'https://mutiny-maker.web.app';
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

  const title = 'Password Reset Request';
  const message = `You have requested to reset your password. Please click the link below to set a new password:\n\n${resetLink}\n\nThis link will expire in 1 hour. If you did not request this, please ignore this email.`;

  await emailQueue.add('send-email', {
    userId: user.id,
    type: 'system',
    title,
    message,
  });

  return { success: true, message: 'If this email is registered, a reset link will be sent.' };
}

export async function resetPassword(dto: ResetPasswordDTO) {
  let decoded: any;
  try {
    decoded = jwt.verify(dto.token, env.JWT_SECRET);
  } catch (error) {
    throw new BadRequestError('Invalid or expired reset token');
  }

  if (decoded.type !== 'password-reset') {
    throw new BadRequestError('Invalid reset token type');
  }

  const userId = decoded.sub;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive) {
    throw new NotFoundError('User not found or inactive');
  }

  const passwordHash = await bcrypt.hash(dto.password, 12);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));

  // Revoke all refresh tokens for this user for security
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));

  return { success: true, message: 'Password has been reset successfully. Please login with your new password.' };
}
