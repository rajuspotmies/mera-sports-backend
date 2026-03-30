import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { bankDetails } from '@/db/schema';
import { NotFoundError, ConflictError } from '@/shared/errors';
import type { UpsertBankDetailsDTO } from './bank-details.schema';

export async function getOwnBankDetails(userId: string) {
  const [row] = await db
    .select()
    .from(bankDetails)
    .where(eq(bankDetails.userId, userId))
    .limit(1);

  return row ?? null;
}

export async function createBankDetails(userId: string, dto: UpsertBankDetailsDTO) {
  const [existing] = await db
    .select({ id: bankDetails.id })
    .from(bankDetails)
    .where(eq(bankDetails.userId, userId))
    .limit(1);

  if (existing) {
    throw new ConflictError('Bank details already exist. Use PUT to update.');
  }

  const [row] = await db
    .insert(bankDetails)
    .values({ userId, ...dto })
    .returning();

  return row;
}

export async function updateBankDetails(userId: string, dto: UpsertBankDetailsDTO) {
  const [existing] = await db
    .select({ id: bankDetails.id })
    .from(bankDetails)
    .where(eq(bankDetails.userId, userId))
    .limit(1);

  if (!existing) throw new NotFoundError('Bank details');

  const [updated] = await db
    .update(bankDetails)
    .set({ ...dto, updatedAt: new Date() })
    .where(eq(bankDetails.userId, userId))
    .returning();

  return updated;
}

export async function deleteBankDetails(userId: string) {
  const [deleted] = await db
    .delete(bankDetails)
    .where(eq(bankDetails.userId, userId))
    .returning({ id: bankDetails.id });

  if (!deleted) throw new NotFoundError('Bank details');
  return { success: true };
}
