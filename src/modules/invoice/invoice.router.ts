import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import { sendInvoiceHandler } from './invoice.controller';

const router = Router({ mergeParams: true });

// POST /api/v1/campaigns/:campaignId/invoice/send
// Generates a PDF invoice and emails it to both the influencer and the brand.
// Returns the PDF as a binary download.
router.post(
  '/send',
  authenticate(),
  authorize('influencer', 'admin'),
  asyncHandler(sendInvoiceHandler)
);

export default router;
