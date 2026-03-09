import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import { counterOfferSchema, acceptOfferSchema } from './negotiation.schema';
import * as ctrl from './negotiation.controller';

// Mounted at /campaigns/:campaignId/negotiation
const router = Router({ mergeParams: true });

// Both brand and influencer can view the negotiation history
router.get(
  '/:influencerId',
  authenticate(),
  asyncHandler(ctrl.getNegotiationHistoryHandler)
);

// Either party makes a counter offer
router.post(
  '/:influencerId/counter',
  authenticate(),
  validate({ body: counterOfferSchema }),
  asyncHandler(ctrl.counterOfferHandler)
);

// Either party accepts the current offer
router.post(
  '/:influencerId/accept',
  authenticate(),
  validate({ body: acceptOfferSchema }),
  asyncHandler(ctrl.acceptOfferHandler)
);

export default router;
