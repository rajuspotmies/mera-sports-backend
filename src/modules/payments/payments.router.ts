import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import { initiatePaymentSchema } from './payments.schema';
import * as ctrl from './payments.controller';

const router = Router();

// Notice: webhook route usually does not require authentication
router.post('/webhook', asyncHandler(ctrl.razorpayWebhookHandler));

router.use(authenticate());

// These routes assume they will be mounted under /api/v1/campaigns/:campaignId/payment
router.post(
    '/',
    authorize('brand_owner', 'admin'),
    validate({ body: initiatePaymentSchema }),
    asyncHandler(ctrl.initiatePaymentHandler)
);

router.get(
    '/status',
    authorize('brand_owner', 'influencer', 'admin'),
    asyncHandler(ctrl.getPaymentStatusHandler)
);

export default router;
