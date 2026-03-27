import type { Request, Response } from 'express';
import * as bankDetailsService from './bank-details.service';
import { sendSuccess } from '@/shared/utils/response';

export async function getOwnBankDetailsHandler(req: Request, res: Response) {
  const result = await bankDetailsService.getOwnBankDetails(req.user.sub);
  sendSuccess(res, result);
}

export async function createBankDetailsHandler(req: Request, res: Response) {
  const result = await bankDetailsService.createBankDetails(req.user.sub, req.body);
  sendSuccess(res, result, 201);
}

export async function updateBankDetailsHandler(req: Request, res: Response) {
  const result = await bankDetailsService.updateBankDetails(req.user.sub, req.body);
  sendSuccess(res, result);
}

export async function deleteBankDetailsHandler(req: Request, res: Response) {
  const result = await bankDetailsService.deleteBankDetails(req.user.sub);
  sendSuccess(res, result);
}
