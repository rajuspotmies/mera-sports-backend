// Standard API response shapes — all endpoints return one of these

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

// Extend Express Request to carry authenticated user info
export interface JWTPayload {
  sub: string;           // user UUID
  role: 'brand_owner' | 'influencer' | 'admin';
  brandId?: string;      // brand_profile UUID (brand_owner only)
  influencerId?: string; // influencer_profile UUID (influencer only)
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user: JWTPayload;
      campaign?: import('@/db/schema').Campaign;
      uploadFolder?: string;
      rawBody?: Buffer;
    }
  }
}
