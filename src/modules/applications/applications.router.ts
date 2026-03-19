import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import { applyToCampaignSchema, listApplicationsQuerySchema } from './applications.schema';
import * as ctrl from './applications.controller';

// Mounted at /campaigns/:campaignId/applications
const router = Router({ mergeParams: true });

// Brand: list all applications for their campaign
router.get(
  '/',
  authenticate(),
  authorize('brand_owner', 'admin'),
  validate({ query: listApplicationsQuerySchema }),
  asyncHandler(ctrl.listApplicationsHandler)
);

// Influencer: apply to a public campaign
router.post(
  '/',
  authenticate(),
  authorize('influencer'),
  validate({ body: applyToCampaignSchema }),
  asyncHandler(ctrl.applyToCampaignHandler)
);

// Influencer: accept a brand invite
router.post(
  '/accept-invite',
  authenticate(),
  authorize('influencer'),
  asyncHandler(ctrl.acceptInviteHandler)
);

// Influencer: decline/withdraw from a brand invite
router.post(
  '/decline-invite',
  authenticate(),
  authorize('influencer'),
  asyncHandler(ctrl.declineInviteHandler)
);

// Brand: approve a specific application
router.post(
  '/:appId/approve',
  authenticate(),
  authorize('brand_owner', 'admin'),
  asyncHandler(ctrl.approveApplicationHandler)
);

// Brand: reject a specific application
router.post(
  '/:appId/reject',
  authenticate(),
  authorize('brand_owner', 'admin'),
  asyncHandler(ctrl.rejectApplicationHandler)
);

// Brand: mark product as shipped for an application
router.post(
  '/:appId/product-shipped',
  authenticate(),
  authorize('brand_owner', 'admin'),
  asyncHandler(ctrl.markProductShippedHandler)
);

// Influencer: confirm product received
router.post(
  '/product-received',
  authenticate(),
  authorize('influencer'),
  asyncHandler(ctrl.confirmProductReceivedHandler)
);

export default router;
