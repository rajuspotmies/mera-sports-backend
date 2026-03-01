import type { Response } from 'express';
import type { SuccessResponse, PaginationMeta } from '@/shared/types/api';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: PaginationMeta
): void {
  const body: SuccessResponse<T> = { success: true, data };
  if (meta) body.meta = meta;
  res.status(statusCode).json(body);
}

export function sendCreated<T>(res: Response, data: T): void {
  sendSuccess(res, data, 201);
}
