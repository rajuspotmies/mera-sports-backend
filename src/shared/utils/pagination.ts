import type { PaginationMeta } from '@/shared/types/api';

export interface PaginationOptions {
  page: number;
  limit: number;
}

export function parsePagination(query: { page?: unknown; limit?: unknown }): PaginationOptions {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20));
  return { page, limit };
}

export function buildPaginationMeta(total: number, options: PaginationOptions): PaginationMeta {
  return {
    page: options.page,
    limit: options.limit,
    total,
    totalPages: Math.ceil(total / options.limit),
  };
}

export function getOffset(options: PaginationOptions): number {
  return (options.page - 1) * options.limit;
}
