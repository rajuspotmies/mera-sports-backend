import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route handler to forward errors to Express's next().
 * This lets us use async/await in controllers without try/catch everywhere.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
