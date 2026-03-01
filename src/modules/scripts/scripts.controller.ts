import type { Request, Response } from 'express';
import * as scriptsService from './scripts.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';
import { BadRequestError } from '@/shared/errors';

export async function listScriptsHandler(req: Request, res: Response): Promise<void> {
  const result = await scriptsService.listScriptsForCampaign(req.params.campaignId, req.user);
  sendSuccess(res, result);
}

export async function submitScriptHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new BadRequestError('No file uploaded');
  const fileUrl = (req.file as any).location || (req.file as any).key; // Fallbacks for multer-s3
  const result = await scriptsService.submitScript(
    req.params.campaignId,
    req.user,
    fileUrl,
    req.file.originalname
  );
  sendCreated(res, result);
}

export async function approveScriptHandler(req: Request, res: Response): Promise<void> {
  const result = await scriptsService.approveScript(req.params.scriptId, req.user);
  sendSuccess(res, result);
}

export async function requestRevisionHandler(req: Request, res: Response): Promise<void> {
  const { reviewNote } = req.body as { reviewNote: string };
  const result = await scriptsService.requestScriptRevision(req.params.scriptId, reviewNote, req.user);
  sendSuccess(res, result);
}
