import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '@/shared/errors';
import type { JWTPayload } from '@/shared/types/api';

type Role = JWTPayload['role'];

/**
 * Role-based access control middleware.
 * Usage: authorize('brand_owner', 'admin')
 */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ForbiddenError('No authenticated user');
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(
        `This endpoint requires one of the following roles: ${roles.join(', ')}`
      );
    }
    next();
  };
}
