import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/shared/errors';
import { logger } from '@/shared/utils/logger';

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  // ── Handled: AppError (4xx / 5xx business errors) ──────────────────────────
  if (err instanceof AppError) {
    // 4xx = expected client error → warn, one line, no stack
    // 5xx = server-side bug → error with stack
    if (err.statusCode >= 500) {
      logger.error(`${req.method} ${req.path} — ${err.message}`, { stack: err.stack });
    } else {
      logger.warn(`${req.method} ${req.path} — ${err.code}: ${err.message}`);
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    });
    return;
  }

  // ── Handled: ZodError (validation) ─────────────────────────────────────────
  if (err instanceof ZodError || (err && typeof err === 'object' && 'name' in err && err.name === 'ZodError')) {
    logger.warn(`${req.method} ${req.path} — VALIDATION_ERROR: Invalid request data`);

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: (err as ZodError).flatten ? (err as ZodError).flatten().fieldErrors : (err as any).issues,
      },
    });
    return;
  }

  // ── Unexpected: truly unknown errors → always log with full stack ──────────
  const message = err instanceof Error ? err.message : 'Unknown error';
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error(`${req.method} ${req.path} — UNEXPECTED: ${message}`, { stack });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};
