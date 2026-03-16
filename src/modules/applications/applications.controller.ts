import type { Request, Response } from 'express';
import * as appService from './applications.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';
import { logger } from '@/shared/utils/logger';

export async function listApplicationsHandler(req: Request, res: Response): Promise<void> {
  const { applications, meta } = await appService.listApplications(
    req.params.campaignId,
    req.user,
    req.query as never
  );
  sendSuccess(res, applications, 200, meta);
}

export async function applyToCampaignHandler(req: Request, res: Response): Promise<void> {
  const result = await appService.applyToCampaign(req.params.campaignId, req.user, req.body);
  sendCreated(res, result);
}

export async function acceptInviteHandler(req: Request, res: Response): Promise<void> {
  const result = await appService.acceptInvite(req.params.campaignId, req.user);
  sendSuccess(res, result);
}

export async function declineInviteHandler(req: Request, res: Response): Promise<void> {
  const result = await appService.declineInvite(req.params.campaignId, req.user);
  sendSuccess(res, result);
}

export async function approveApplicationHandler(req: Request, res: Response): Promise<void> {
  const result = await appService.approveApplication(
    req.params.campaignId,
    req.params.appId,
    req.user
  );
  sendSuccess(res, result);
}

export async function rejectApplicationHandler(req: Request, res: Response): Promise<void> {
  const result = await appService.rejectApplication(
    req.params.campaignId,
    req.params.appId,
    req.user
  );
  sendSuccess(res, result);
}

export async function getMyApplicationsHandler(req: Request, res: Response): Promise<void> {
  const influencerId = req.user.influencerId;
  const { applications, meta } = await appService.getMyApplications(req.user, req.query as never);
  logger.info(`[Applications] GET my applications: influencerId=${influencerId}, count=${applications.length}, total=${meta?.total ?? 0}`);
  sendSuccess(res, applications, 200, meta);
}
