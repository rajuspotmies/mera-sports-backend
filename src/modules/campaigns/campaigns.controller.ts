import type { Request, Response } from 'express';
import * as campaignsService from './campaigns.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';
import { BadRequestError } from '@/shared/errors';
import { getPublicUrl } from '@/config/s3';

export async function listCampaignsHandler(req: Request, res: Response): Promise<void> {
  // brand_owner sees their own; influencer sees discover endpoint
  if (req.user.role === 'influencer') {
    const { campaigns, meta } = await campaignsService.discoverCampaigns(req.query as never);
    sendSuccess(res, campaigns, 200, meta);
    return;
  }
  const { campaigns, meta } = await campaignsService.listCampaignsForBrand(req.user, req.query as never);
  sendSuccess(res, campaigns, 200, meta);
}

export async function discoverCampaignsHandler(req: Request, res: Response): Promise<void> {
  const { campaigns, meta } = await campaignsService.discoverCampaigns(req.query as never);
  sendSuccess(res, campaigns, 200, meta);
}

export async function getCampaignHandler(req: Request, res: Response): Promise<void> {
  const result = await campaignsService.getCampaignById(req.params.id, req.user);
  sendSuccess(res, result);
}

export async function createCampaignHandler(req: Request, res: Response): Promise<void> {
  const result = await campaignsService.createCampaign(req.user, req.body);
  sendCreated(res, result);
}

export async function updateCampaignHandler(req: Request, res: Response): Promise<void> {
  const result = await campaignsService.updateCampaign(req.params.id, req.user, req.body);
  sendSuccess(res, result);
}

export async function deleteCampaignHandler(req: Request, res: Response): Promise<void> {
  await campaignsService.deleteCampaign(req.params.id, req.user);
  sendSuccess(res, { message: 'Campaign deleted' });
}

export async function launchCampaignHandler(req: Request, res: Response): Promise<void> {
  const result = await campaignsService.launchCampaign(req.params.id, req.user);
  sendSuccess(res, result);
}

export async function closeCampaignHandler(req: Request, res: Response): Promise<void> {
  const result = await campaignsService.closeCampaign(req.params.id, req.user);
  sendSuccess(res, result);
}

export async function uploadThumbnailHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new BadRequestError('No file uploaded');
  const key = (req.file as any).key; // Ensure we only get the S3 key, ignoring the public .location
  const fileUrl = getPublicUrl(key);
  const result = await campaignsService.updateCampaignThumbnail(req.params.id, req.user, fileUrl);
  sendSuccess(res, result);
}
