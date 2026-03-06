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
      brandType: brandProfiles.brandType,
      brandLogoUrl: brandProfiles.brandLogoUrl,
      industry: brandProfiles.industry,
      website: brandProfiles.website,
      city: brandProfiles.city,
      primaryLanguage: brandProfiles.primaryLanguage,
      otherLanguages: brandProfiles.otherLanguages,
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

  return {
    id: brand.id,
    name: brand.userName,
    brandName: brand.brandName,
    brandType: brand.brandType || "",
    website: brand.website || "",
    city: brand.city || "",
    primaryLanguage: brand.primaryLanguage || "",
    otherLanguages: brand.otherLanguages || [],
    industry: brand.industry || "",
    bio: brand.description || "",
    avatar: brand.brandLogoUrl || ""
  };
}

export async function updateBrandProfile(userId: string, dto: UpdateBrandDTO) {
  const [brand] = await db
    .select({ id: brandProfiles.id })
    .from(brandProfiles)
    .where(eq(brandProfiles.userId, userId))
    .limit(1);

  if (!brand) throw new NotFoundError('Brand profile');



  const updateData: any = {
    updatedAt: new Date(),
  };

  if (dto.brandName !== undefined) updateData.brandName = dto.brandName;
  if (dto.brandType !== undefined) updateData.brandType = dto.brandType;
  if (dto.industry !== undefined) updateData.industry = dto.industry;
  if (dto.website !== undefined) updateData.website = dto.website;
  if (dto.city !== undefined) updateData.city = dto.city;
  if (dto.primaryLanguage !== undefined) updateData.primaryLanguage = dto.primaryLanguage;
  if (dto.otherLanguages !== undefined) updateData.otherLanguages = dto.otherLanguages;
  if (dto.bio !== undefined) updateData.description = dto.bio;

  // Update user name if provided and not undefined
  let updatedUserName = undefined;
  if (dto.name !== undefined) {
    const [updatedUser] = await db
      .update(users)
      .set({ name: dto.name, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    updatedUserName = updatedUser.name;
  }

  const [updated] = await db
    .update(brandProfiles)
    .set(updateData)
    .where(eq(brandProfiles.id, brand.id))
    .returning();

  return {
    id: updated.id,
    name: updatedUserName || dto.name,
    brandName: updated.brandName,
    brandType: updated.brandType || "",
    website: updated.website || "",
    city: updated.city || "",
    primaryLanguage: updated.primaryLanguage || "",
    otherLanguages: updated.otherLanguages || [],
    industry: updated.industry || "",
    bio: updated.description || "",
    avatar: updated.brandLogoUrl || ""
  };
}

export async function updateBrandLogo(userId: string, logoUrl: string) {
  const [brand] = await db
    .select({ id: brandProfiles.id })
    .from(brandProfiles)
    .where(eq(brandProfiles.userId, userId))
    .limit(1);

  if (!brand) throw new NotFoundError('Brand profile');

  await db
    .update(brandProfiles)
    .set({ brandLogoUrl: logoUrl, updatedAt: new Date() })
    .where(eq(brandProfiles.id, brand.id));

  return { url: logoUrl };
}
