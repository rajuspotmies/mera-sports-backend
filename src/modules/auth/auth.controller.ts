import type { Request, Response, NextFunction, CookieOptions } from 'express';
import * as authService from './auth.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';
import { env } from '@/config/env';

type Role = 'brand_owner' | 'influencer' | 'admin';

// ─── Cookie Configuration ────────────────────────────────────────────────────

const isProduction = env.NODE_ENV === 'production';

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',                       // all cookies are sent on every request
};

const ACCESS_MAX_AGE = 60 * 60 * 1000;                                              // 1 hour
const REFRESH_MAX_AGE = (parseInt(env.REFRESH_TOKEN_EXPIRES_IN, 10) || 30) * 24 * 60 * 60 * 1000; // 30 days

/** Returns consistent cookie names + options for a given role */
function cookieNames(role: Role) {
  return {
    access: `${role}_access_token`,   // e.g. brand_owner_access_token
    refresh: `${role}_refresh_token`,  // e.g. brand_owner_refresh_token
  };
}

function setAuthCookies(res: Response, role: Role, accessToken: string, refreshToken: string) {
  const names = cookieNames(role);
  res.cookie(names.access, accessToken, { ...baseCookieOptions, maxAge: ACCESS_MAX_AGE });
  res.cookie(names.refresh, refreshToken, { ...baseCookieOptions, maxAge: REFRESH_MAX_AGE });
}

function clearAuthCookies(res: Response, role: Role) {
  const names = cookieNames(role);
  res.clearCookie(names.access, { ...baseCookieOptions });
  res.clearCookie(names.refresh, { ...baseCookieOptions });
}

// ─── Handlers (factories accept role, return Express handler) ────────────────

export const registerHandler = (role: Role) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body.role = role;           // force correct role regardless of what client sends
      const { accessToken, refreshToken, user } = await authService.register(req.body);
      setAuthCookies(res, role, accessToken, refreshToken);
      sendCreated(res, { user });     // tokens live only in httpOnly cookies
    } catch (error) {
      next(error);
    }
  };
};

export const loginHandler = (role: Role) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accessToken, refreshToken, user } = await authService.login(req.body);

      // Enforce role — reject login if the user's role doesn't match this endpoint
      if (user.role !== role) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: `This login endpoint is for ${role} accounts only` },
        });
        return;
      }

      setAuthCookies(res, role, accessToken, refreshToken);
      sendSuccess(res, { user });
    } catch (error) {
      next(error);
    }
  };
};

export const refreshHandler = (role: Role) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const names = cookieNames(role);
      const rawRefresh = (req.cookies as Record<string, string>)?.[names.refresh];
      if (!rawRefresh) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing refresh token' } });
        return;
      }
      const { accessToken, refreshToken: newRefreshToken, user } = await authService.refresh(rawRefresh);
      setAuthCookies(res, role, accessToken, newRefreshToken);
      sendSuccess(res, { user });
    } catch (error) {
      next(error);
    }
  };
};

export const logoutHandler = (role: Role) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const names = cookieNames(role);
      const rawRefresh = (req.cookies as Record<string, string>)?.[names.refresh];
      if (rawRefresh) {
        await authService.logout(rawRefresh);
      }
      clearAuthCookies(res, role);
      sendSuccess(res, { message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  };
};

export const getMeHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.getMe(req.user.sub);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

export const updateMeHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.updateMe(req.user.sub, req.body);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

export const deleteMeHandler = (role: Role) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await authService.softDeleteUser(req.user.sub);
      clearAuthCookies(res, role);
      sendSuccess(res, { message: 'Account deleted successfully' });
    } catch (error) {
      next(error);
    }
  };
};
