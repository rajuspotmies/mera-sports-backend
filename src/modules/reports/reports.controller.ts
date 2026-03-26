import type { Request, Response } from 'express';
import * as reportsService from './reports.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';

export async function createReportHandler(req: Request, res: Response) {
  const userId = req.user.sub;
  const report = await reportsService.createReport(userId, req.body);
  sendCreated(res, { reportId: report.id, status: 'submitted' });
}

export async function blockUserHandler(req: Request, res: Response) {
  const userId = req.user.sub;
  const block = await reportsService.blockUser(userId, req.body);
  sendCreated(res, { blockId: block.id, status: 'blocked' });
}

export async function unblockUserHandler(req: Request, res: Response) {
  const userId = req.user.sub;
  const { targetId } = req.params;
  await reportsService.unblockUser(userId, targetId);
  sendSuccess(res, { message: 'User unblocked' });
}
