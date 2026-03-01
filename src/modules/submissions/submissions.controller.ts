import type { Request, Response } from 'express';
import * as submissionsService from './submissions.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';
import { z } from 'zod';

const submitWorkBody = z.object({
  type: z.string(),
  url: z.string().url(),
  proofOfWorkUrl: z.string().url().optional(),
});

const reviewBody = z.object({ reviewNote: z.string().optional().default('') });

export async function listSubmissionsHandler(req: Request, res: Response): Promise<void> {
  const result = await submissionsService.listSubmissions(req.params.campaignId, req.user);
  sendSuccess(res, result);
}

export async function submitWorkHandler(req: Request, res: Response): Promise<void> {
  const dto = submitWorkBody.parse(req.body);
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
