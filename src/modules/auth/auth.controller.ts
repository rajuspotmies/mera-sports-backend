import type { Request, Response } from 'express';
import * as authService from './auth.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body);
  sendCreated(res, result);
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body);
  sendSuccess(res, result);
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken: string };
  const result = await authService.refresh(refreshToken);
  sendSuccess(res, result);
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken: string };
  await authService.logout(refreshToken);
  sendSuccess(res, { message: 'Logged out successfully' });
}

export async function getMeHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.getMe(req.user.sub);
  sendSuccess(res, result);
}
