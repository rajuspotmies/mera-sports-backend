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
  const fileUrl = (req.file as any).location || (req.file as any).key; // Fallbacks for multer-s3
  const result = await brandService.updateBrandLogo(req.user.sub, fileUrl);
  sendSuccess(res, result);
}
