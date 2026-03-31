import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import { initiatePaymentRoundSchema, verifyPaymentSchema, cancelPaymentSchema } from './payments.schema';
import * as ctrl from './payments.controller';

const router = Router({ mergeParams: true });

router.use(authenticate());

// Initiate a payment round for accepted / work_review influencers
router.post(
  '/',
  authorize('brand_owner', 'admin'),
  validate({ body: initiatePaymentRoundSchema }),
  asyncHandler(ctrl.initiatePaymentRoundHandler)
);

// Verify successful Cashfree payment (client-side callback)
router.post(
  '/verify',
  authorize('brand_owner', 'admin'),
  validate({ body: verifyPaymentSchema }),
  asyncHandler(ctrl.verifyPaymentHandler)
);

// Cancel a pending payment round (user closed the modal mid-payment)
router.patch(
  '/:paymentId/cancel',
  authorize('brand_owner', 'admin'),
  validate({ body: cancelPaymentSchema }),
  asyncHandler(ctrl.cancelPaymentHandler)
);

// Payment summary: rounds, amounts, eligible counts
router.get(
  '/summary',
  authorize('brand_owner', 'admin'),
  asyncHandler(ctrl.getPaymentSummaryHandler)
);

// Payment round details
router.get(
  '/:paymentId',
  authorize('brand_owner', 'admin'),
  asyncHandler(ctrl.getPaymentRoundHandler)
);

export default router;
