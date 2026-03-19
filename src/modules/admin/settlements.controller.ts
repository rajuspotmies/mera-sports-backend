import { Request, Response } from 'express';
import * as settlementsService from './settlements.service';
import { sendSuccess } from '@/shared/utils/response';

export async function listUnsettledHandler(req: Request, res: Response) {
  const campaignId = req.query.campaignId as string | undefined;
  const result = await settlementsService.listUnsettledInfluencers(campaignId);
  sendSuccess(res, result);
}

export async function settleInfluencerHandler(req: Request, res: Response) {
  const { ciId } = req.params;
  const result = await settlementsService.settleInfluencer(req.user.sub, ciId, req.body);
  sendSuccess(res, result, 201);
}

export async function listSettlementsHandler(req: Request, res: Response) {
  const campaignId = req.query.campaignId as string | undefined;
  const result = await settlementsService.listSettlements(campaignId);
  sendSuccess(res, result);
}
