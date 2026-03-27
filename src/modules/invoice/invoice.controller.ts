import { Request, Response } from 'express';
import { sendCampaignInvoice } from './invoice.service';
import { sendSuccess } from '@/shared/utils/response';

export async function sendInvoiceHandler(req: Request, res: Response) {
  const { campaignId } = req.params;
  const influencerUserId = req.user.sub;

  const result = await sendCampaignInvoice(campaignId, influencerUserId);

  // PDF is emailed to both parties; return JSON confirmation to mobile client
  sendSuccess(res, {
    invoiceNumber: result.invoiceNumber,
    campaignName: result.campaignName,
    emailedTo: result.emailedTo,
    message: `Invoice #${result.invoiceNumber} has been emailed to all parties.`,
  }, 200);
}
