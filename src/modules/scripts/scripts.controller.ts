import type { Request, Response } from 'express';
import * as scriptsService from './scripts.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';
import { BadRequestError } from '@/shared/errors';
import { z } from 'zod';

const submitScriptBody = z.object({
  externalUrl: z.string().url().optional(),
  textContent: z.string().trim().min(1).max(5000).optional(),
});

export async function listScriptsHandler(req: Request, res: Response): Promise<void> {
  const result = await scriptsService.listScriptsForCampaign(req.params.campaignId, req.user);
  sendSuccess(res, result);
}

export async function getMyScriptsHandler(req: Request, res: Response): Promise<void> {
  const result = await scriptsService.getScriptsForInfluencer(req.params.campaignId, req.user);
  sendSuccess(res, result);
}

export async function submitScriptHandler(req: Request, res: Response): Promise<void> {
  const body = submitScriptBody.parse(req.body);
  const key = (req.file as any)?.key;
  const proxyUrl = key ? `/api/v1/uploads/${key}` : undefined;
  if (!proxyUrl && !body.externalUrl && !body.textContent) {
    throw new BadRequestError('Provide at least one of file, externalUrl, or textContent');
  }
  const result = await scriptsService.submitScript(
    req.params.campaignId,
    req.user,
    {
      fileUrl: proxyUrl,
      originalName: req.file?.originalname,
      mediaType: req.file?.mimetype,
      externalUrl: body.externalUrl,
      textContent: body.textContent,
    }
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
