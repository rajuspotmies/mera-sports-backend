import type { Request, Response } from 'express';
import * as negotiationService from './negotiation.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';

export async function getNegotiationHistoryHandler(req: Request, res: Response): Promise<void> {
  const result = await negotiationService.getNegotiationHistory(
    req.params.campaignId,
    req.params.influencerId,
    req.user
  );
  sendSuccess(res, result);
}

export async function counterOfferHandler(req: Request, res: Response): Promise<void> {
  const result = await negotiationService.counterOffer(
    req.params.campaignId,
    req.params.influencerId,
    req.user,
    req.body
  );
  sendCreated(res, result);
}

export async function acceptOfferHandler(req: Request, res: Response): Promise<void> {
  const result = await negotiationService.acceptOffer(
    req.params.campaignId,
    req.params.influencerId,
    req.user,
    req.body
  );
  sendSuccess(res, result);
}
