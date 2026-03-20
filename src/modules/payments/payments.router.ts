import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import { initiatePaymentRoundSchema, verifyPaymentSchema } from './payments.schema';
import * as ctrl from './payments.controller';

const router = Router({ mergeParams: true });

router.use(authenticate());

// Initiate a payment round for all accepted (unpaid) influencers
router.post(
  '/',
  authorize('brand_owner', 'admin'),
  validate({ body: initiatePaymentRoundSchema }),
  asyncHandler(ctrl.initiatePaymentRoundHandler)
);

// Verify a successful Razorpay payment (Signature check)
router.post(
  '/verify',
  authorize('brand_owner', 'admin'),
  validate({ body: verifyPaymentSchema }),
  asyncHandler(ctrl.verifyPaymentHandler)
);

// Payment summary: rounds, amounts, eligible counts
router.get(
  '/summary',
  authorize('brand_owner', 'admin'),
  asyncHandler(ctrl.getPaymentSummaryHandler)
);

// Payment round details (which influencers, amounts)
router.get(
  '/:paymentId',
  authorize('brand_owner', 'admin'),
  asyncHandler(ctrl.getPaymentRoundHandler)
);

export default router;
