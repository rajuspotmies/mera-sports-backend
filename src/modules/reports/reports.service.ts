import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { reports, blocks } from '@/db/schema';
import type { CreateReportDTO, CreateBlockDTO } from './reports.schema';
import { ConflictError } from '@/shared/errors';

export async function createReport(userId: string, dto: CreateReportDTO) {
  const [report] = await db
    .insert(reports)
    .values({
      reporterId: userId,
      targetId: dto.targetId,
      targetType: dto.targetType,
      reason: dto.reason,
      description: dto.description,
      contextType: dto.contextType,
      contextId: dto.contextId,
    })
    .returning();
  return report;
}

export async function blockUser(userId: string, dto: CreateBlockDTO) {
  try {
    const [block] = await db
      .insert(blocks)
      .values({
        userId,
        targetId: dto.targetId,
        targetType: dto.targetType,
      })
      .returning();
    return block;
  } catch (error: any) {
    if (error.code === '23505') { // Postgres code for unique_violation
      throw new ConflictError('User is already blocked');
    }
    throw error;
  }
}

export async function unblockUser(userId: string, targetId: string) {
  await db
    .delete(blocks)
    .where(and(eq(blocks.userId, userId), eq(blocks.targetId, targetId)));
}
