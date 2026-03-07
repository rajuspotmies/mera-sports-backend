import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import * as ctrl from './analytics.controller';

const router = Router();

router.use(authenticate, authorize('brand_owner', 'influencer', 'admin'));

router.get('/overview', asyncHandler(ctrl.overviewHandler));
router.get('/campaigns/:campaignId', asyncHandler(ctrl.campaignAnalyticsHandler));
router.get('/content', asyncHandler(ctrl.contentAnalyticsHandler));

export default router;
