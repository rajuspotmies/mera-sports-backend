import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { upload, setUploadFolder } from '@/middleware/upload';
import { uploadLimiter } from '@/middleware/rateLimiter';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import {
  createCampaignSchema,
  updateCampaignSchema,
  listCampaignsQuerySchema,
} from './campaigns.schema';
import * as ctrl from './campaigns.controller';

// Sub-routers for nested resources (mounted in campaigns router)
import applicationsRouter from '@/modules/applications/applications.router';
import negotiationRouter from '@/modules/negotiation/negotiation.router';
import scriptsRouter from '@/modules/scripts/scripts.router';
import submissionsRouter from '@/modules/submissions/submissions.router';
import paymentsRouter from '@/modules/payments/payments.router';
import invoiceRouter from '@/modules/invoice/invoice.router';

const router = Router();

// ─── Public discover (influencer side, authenticated) ────────────────────────
router.get(
  '/discover',
  authenticate(),
  authorize('influencer', 'admin'),
  validate({ query: listCampaignsQuerySchema }),
  asyncHandler(ctrl.discoverCampaignsHandler)
);

// ─── Brand campaigns ──────────────────────────────────────────────────────────
router.get(
  '/',
  authenticate(),
  validate({ query: listCampaignsQuerySchema }),
  asyncHandler(ctrl.listCampaignsHandler)
);

router.post(
  '/',
  authenticate(),
  authorize('brand_owner', 'admin'),
  validate({ body: createCampaignSchema }),
  asyncHandler(ctrl.createCampaignHandler)
);

router.get(
  '/:id',
  authenticate(),
  asyncHandler(ctrl.getCampaignHandler)
);

router.put(
  '/:id',
  authenticate(),
  authorize('brand_owner', 'admin'),
  validate({ body: updateCampaignSchema }),
  asyncHandler(ctrl.updateCampaignHandler)
);

router.delete(
  '/:id',
  authenticate(),
  authorize('brand_owner', 'admin'),
  asyncHandler(ctrl.deleteCampaignHandler)
);

router.post(
  '/:id/launch',
  authenticate(),
  authorize('brand_owner', 'admin'),
  asyncHandler(ctrl.launchCampaignHandler)
);

router.post(
  '/:id/close',
  authenticate(),
  authorize('brand_owner', 'admin'),
  asyncHandler(ctrl.closeCampaignHandler)
);

router.post(
  '/:id/thumbnail',
  authenticate(),
  authorize('brand_owner', 'admin'),
  uploadLimiter,
  setUploadFolder('campaigns'),
  upload.single('file'),
  asyncHandler(ctrl.uploadThumbnailHandler)
);


// ─── Nested sub-routes ────────────────────────────────────────────────────────
// Mount with :campaignId param (re-parameterize from :id to :campaignId for sub-routers)
router.use('/:campaignId/applications', applicationsRouter);
router.use('/:campaignId/negotiation', negotiationRouter);
router.use('/:campaignId/scripts', scriptsRouter);
router.use('/:campaignId/submissions', submissionsRouter);
router.use('/:campaignId/payment', paymentsRouter);
router.use('/:campaignId/invoice', invoiceRouter);

export default router;
