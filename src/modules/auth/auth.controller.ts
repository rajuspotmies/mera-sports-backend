import type { Request, Response, CookieOptions } from 'express';
import * as authService from './auth.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';
import { env } from '@/config/env';

const COOKIE_NAME = 'refresh_token';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: (parseInt(env.REFRESH_TOKEN_EXPIRES_IN, 10) || 30) * 24 * 60 * 60 * 1000,
};

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const { refreshToken, ...rest } = await authService.register(req.body);
  res.cookie(COOKIE_NAME, refreshToken, cookieOptions);
  sendCreated(res, rest);
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { refreshToken, ...rest } = await authService.login(req.body);
  res.cookie(COOKIE_NAME, refreshToken, cookieOptions);
  sendSuccess(res, rest);
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const refreshToken = (req.cookies as Record<string, string>)[COOKIE_NAME] || req.body.refreshToken;
  const { refreshToken: newRefreshToken, ...rest } = await authService.refresh(refreshToken);
  res.cookie(COOKIE_NAME, newRefreshToken, cookieOptions);
  sendSuccess(res, rest);
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const refreshToken = (req.cookies as Record<string, string>)[COOKIE_NAME] || req.body.refreshToken;
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  res.clearCookie(COOKIE_NAME, cookieOptions);
  sendSuccess(res, { message: 'Logged out successfully' });
}

export async function getMeHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.getMe(req.user.sub);
  sendSuccess(res, result);
}

export async function updateMeHandler(req: Request, res: Response): Promise<void> {
  const result = await authService.updateMe(req.user.sub, req.body);
  sendSuccess(res, result);
}

export async function deleteMeHandler(req: Request, res: Response): Promise<void> {
  await authService.softDeleteUser(req.user.sub);
  res.clearCookie(COOKIE_NAME, cookieOptions);
  sendSuccess(res, { message: 'Account deleted successfully' });
}
