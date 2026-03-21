import type { Request, Response } from 'express';
import * as influencersService from './influencers.service';
import { sendSuccess } from '@/shared/utils/response';
import { BadRequestError } from '@/shared/errors';

export async function getOwnProfileHandler(req: Request, res: Response): Promise<void> {
  const result = await influencersService.getOwnInfluencerProfile(req.user.sub);
  sendSuccess(res, result);
}

export async function updateOwnProfileHandler(req: Request, res: Response): Promise<void> {
  const result = await influencersService.updateOwnInfluencerProfile(req.user.sub, req.body);
  sendSuccess(res, result);
}

export async function uploadAvatarHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new BadRequestError('No file uploaded');
  const fileUrl = (req.file as any).key; // Always store S3 key; frontend resolves via /uploads/ proxy
  const result = await influencersService.updateInfluencerAvatar(req.user.sub, fileUrl);
  sendSuccess(res, result);
}

export async function searchInfluencersHandler(req: Request, res: Response): Promise<void> {
  const { influencers, meta } = await influencersService.searchInfluencers(req.query as never);
  sendSuccess(res, influencers, 200, meta);
}

export async function getInfluencerByIdHandler(req: Request, res: Response): Promise<void> {
  const result = await influencersService.getInfluencerById(req.params.id);
  sendSuccess(res, result);
}

export async function inviteInfluencersHandler(req: Request, res: Response): Promise<void> {
  const result = await influencersService.inviteInfluencers(req.user, req.body);
  sendSuccess(res, result, 201);
}

// ─── Portfolio ───────────────────────────────────────────────────────────────

export async function addPortfolioItemHandler(req: Request, res: Response): Promise<void> {
  const result = await influencersService.addPortfolioItem(req.user.sub, req.body);
  sendSuccess(res, result, 201);
}

export async function updatePortfolioItemHandler(req: Request, res: Response): Promise<void> {
  const result = await influencersService.updatePortfolioItem(req.user.sub, req.params.itemId, req.body);
  sendSuccess(res, result);
}

export async function deletePortfolioItemHandler(req: Request, res: Response): Promise<void> {
  await influencersService.deletePortfolioItem(req.user.sub, req.params.itemId);
  sendSuccess(res, { message: 'Portfolio item deleted' });
}
