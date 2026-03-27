import type { Request, Response } from 'express';
import * as socialService from './social.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';

export async function connectSocialHandler(req: Request, res: Response): Promise<void> {
  const result = await socialService.connectSocial(req.user.sub, req.body);
  sendCreated(res, result);
}

export async function disconnectSocialHandler(req: Request, res: Response): Promise<void> {
  await socialService.disconnectSocial(req.user.sub, req.body);
  sendSuccess(res, { message: 'Disconnected successfully' });
}

export async function getSocialStatusHandler(req: Request, res: Response): Promise<void> {
  const result = await socialService.getSocialStatus(req.user.sub);
  sendSuccess(res, result);
}
