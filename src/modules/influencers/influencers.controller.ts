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
  const result = await influencersService.updateInfluencerAvatar(req.user.sub, req.file.filename);
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

export async function inviteInfluencerHandler(req: Request, res: Response): Promise<void> {
  const result = await influencersService.inviteInfluencer(req.user, req.body);
  sendSuccess(res, result, 201);
}

export async function bulkInviteHandler(req: Request, res: Response): Promise<void> {
  const result = await influencersService.bulkInviteInfluencers(req.user, req.body);
  sendSuccess(res, result);
}
