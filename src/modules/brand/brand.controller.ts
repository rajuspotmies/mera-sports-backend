import type { Request, Response } from 'express';
import * as brandService from './brand.service';
import { sendSuccess } from '@/shared/utils/response';
import { BadRequestError } from '@/shared/errors';

export async function getBrandProfileHandler(req: Request, res: Response): Promise<void> {
  const result = await brandService.getBrandProfile(req.user.sub);
  sendSuccess(res, result);
}

export async function updateBrandProfileHandler(req: Request, res: Response): Promise<void> {
  const result = await brandService.updateBrandProfile(req.user.sub, req.body);
  sendSuccess(res, result);
}

export async function uploadBrandLogoHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new BadRequestError('No file uploaded');
  const key = (req.file as any).key; // Ensure we only get the S3 key, ignoring the public .location

  // We don't import getPublicUrl here yet, let's just save the proxy URL
  // Actually, we should import it or just manually construct it.
  const proxyUrl = `/api/v1/uploads/${key}`;

  const result = await brandService.updateBrandLogo(req.user.sub, proxyUrl);
  sendSuccess(res, result);
}
