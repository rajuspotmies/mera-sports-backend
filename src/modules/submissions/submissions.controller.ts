import type { Request, Response } from 'express';
import * as submissionsService from './submissions.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';
import { z } from 'zod';
import { BadRequestError } from '@/shared/errors';

const submitWorkBody = z.object({
  type: z.string().min(1),
  url: z.string().url().optional(),
  externalUrl: z.string().url().optional(),
  textContent: z.string().trim().min(1).max(5000).optional(),
  proofOfWorkUrl: z.string().url().optional(),
});

const reviewBody = z.object({ reviewNote: z.string().optional().default('') });

export async function listSubmissionsHandler(req: Request, res: Response): Promise<void> {
  const result = await submissionsService.listSubmissions(req.params.campaignId, req.user);
  sendSuccess(res, result);
}

export async function submitWorkHandler(req: Request, res: Response): Promise<void> {
  const body = submitWorkBody.parse(req.body);
  const key = (req.file as any)?.key as string | undefined;
  const fileUrl = key ? `/api/v1/uploads/${key}` : undefined;
  const fileName = req.file?.originalname;

  if (!body.url && !body.externalUrl && !body.textContent && !fileUrl) {
    throw new BadRequestError('Submit at least one of: file, externalUrl/url, or textContent');
  }

  const dto = {
    ...body,
    mediaUrl: fileUrl,
    fileName,
    mediaType: req.file?.mimetype,
  };
  const result = await submissionsService.submitWork(req.params.campaignId, req.user, dto);
  sendCreated(res, result);
}

export async function approveSubmissionHandler(req: Request, res: Response): Promise<void> {
  const result = await submissionsService.approveSubmission(req.params.subId, req.user);
  sendSuccess(res, result);
}

export async function rejectSubmissionHandler(req: Request, res: Response): Promise<void> {
  const { reviewNote } = reviewBody.parse(req.body);
  const result = await submissionsService.rejectSubmission(req.params.subId, reviewNote, req.user);
  sendSuccess(res, result);
}
