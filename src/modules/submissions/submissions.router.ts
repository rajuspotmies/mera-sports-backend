import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import * as ctrl from './submissions.controller';

// Mounted at /campaigns/:campaignId/submissions
const router = Router({ mergeParams: true });

router.get('/', authenticate, authorize('brand_owner', 'admin'), asyncHandler(ctrl.listSubmissionsHandler));
router.post('/', authenticate, authorize('influencer'), asyncHandler(ctrl.submitWorkHandler));
router.post('/:subId/approve', authenticate, authorize('brand_owner', 'admin'), asyncHandler(ctrl.approveSubmissionHandler));
router.post('/:subId/reject', authenticate, authorize('brand_owner', 'admin'), asyncHandler(ctrl.rejectSubmissionHandler));

export default router;
