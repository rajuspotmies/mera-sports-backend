import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { UnauthorizedError } from '@/shared/errors';
import type { JWTPayload } from '@/shared/types/api';

/**
 * Cookie names must match what auth.controller sets:
 *   brand_owner_access_token, influencer_access_token, admin_access_token
 */
const ROLE_COOKIE_MAP: Record<string, string> = {
  brand_owner: 'brand_owner_access_token',
  influencer: 'influencer_access_token',
  admin: 'admin_access_token',
};

/**
 * Creates an authentication middleware bound to a specific role.
 *
 * Usage in routers:
 *   authenticate('brand_owner')   → only accepts brand_owner cookie / token
 *   authenticate('influencer')    → only accepts influencer cookie / token
 *   authenticate('admin')         → only accepts admin cookie / token
 *   authenticate()                → accepts any valid token (Bearer header required or X-Role-Context)
 */
export function authenticate(expectedRole?: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    let token: string | undefined;

    // 1. Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // 2. Fallback to role-specific HttpOnly cookies
    if (!token) {
      if (expectedRole && ROLE_COOKIE_MAP[expectedRole]) {
        // Role is enforced — only read that role's cookie
        token = req.cookies?.[ROLE_COOKIE_MAP[expectedRole]];
      } else {
        // No role enforced — try X-Role-Context header, then fallback
        const roleContext = req.headers['x-role-context'] as string | undefined;
        if (roleContext && ROLE_COOKIE_MAP[roleContext]) {
          token = req.cookies?.[ROLE_COOKIE_MAP[roleContext]];
        } else {
          // Last resort: try all cookies
          for (const cookieName of Object.values(ROLE_COOKIE_MAP)) {
            if (req.cookies?.[cookieName]) {
              token = req.cookies[cookieName];
              break;
            }
          }
        }
      }

      // CSRF protection for mutating requests when using cookie-based auth
      if (token) {
        const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
        if (isMutating && !req.headers['x-requested-with']) {
          throw new UnauthorizedError('CSRF protection: X-Requested-With header required');
        }
      }
    }

    if (!token) {
      throw new UnauthorizedError('Missing or malformed authentication');
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JWTPayload;

      // Enforce role if specified — reject tokens from wrong roles
      if (expectedRole && payload.role !== expectedRole) {
        throw new UnauthorizedError(`Access denied: requires ${expectedRole} role`);
      }

      req.user = payload;
      next();
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError('Invalid or expired access token');
    }
  };
}
