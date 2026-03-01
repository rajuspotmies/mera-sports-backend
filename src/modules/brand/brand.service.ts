import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { brandProfiles, users } from '@/db/schema';
import { NotFoundError } from '@/shared/errors';
import type { UpdateBrandDTO } from './brand.schema';

export async function getBrandProfile(userId: string) {
  const [brand] = await db
    .select({
      id: brandProfiles.id,
      userId: brandProfiles.userId,
      brandName: brandProfiles.brandName,
      brandLogoUrl: brandProfiles.brandLogoUrl,
      industry: brandProfiles.industry,
      website: brandProfiles.website,
      description: brandProfiles.description,
      verified: brandProfiles.verified,
      createdAt: brandProfiles.createdAt,
      updatedAt: brandProfiles.updatedAt,
      // user info
      userName: users.name,
      userEmail: users.email,
      userAvatarUrl: users.avatarUrl,
    })
    .from(brandProfiles)
    .innerJoin(users, eq(users.id, brandProfiles.userId))
    .where(eq(brandProfiles.userId, userId))
    .limit(1);

  if (!brand) throw new NotFoundError('Brand profile');
  return brand;
}

export async function updateBrandProfile(userId: string, dto: UpdateBrandDTO) {
  const [brand] = await db
    .select({ id: brandProfiles.id })
    .from(brandProfiles)
    .where(eq(brandProfiles.userId, userId))
    .limit(1);

  if (!brand) throw new NotFoundError('Brand profile');

  const [updated] = await db
    .update(brandProfiles)
    .set({
      ...dto,
      updatedAt: new Date(),
    })
    .where(eq(brandProfiles.id, brand.id))
    .returning();

  return updated;
}

export async function updateBrandLogo(userId: string, logoUrl: string) {
  const [brand] = await db
    .select({ id: brandProfiles.id })
    .from(brandProfiles)
    .where(eq(brandProfiles.userId, userId))
    .limit(1);

  if (!brand) throw new NotFoundError('Brand profile');

  const [updated] = await db
    .update(brandProfiles)
    .set({ brandLogoUrl: logoUrl, updatedAt: new Date() })
    .where(eq(brandProfiles.id, brand.id))
    .returning();

  return updated;
}
