import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { upload, setUploadFolder } from '@/middleware/upload';
import { uploadLimiter } from '@/middleware/rateLimiter';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import * as ctrl from './submissions.controller';

// Mounted at /campaigns/:campaignId/submissions
const router = Router({ mergeParams: true });

router.get('/', authenticate(), authorize('brand_owner', 'admin'), asyncHandler(ctrl.listSubmissionsHandler));
router.post(
  '/',
  authenticate(),
  authorize('influencer'),
  uploadLimiter,
  setUploadFolder('submissions'),
  upload.single('file'),
  asyncHandler(ctrl.submitWorkHandler)
);
router.post('/:subId/approve', authenticate(), authorize('brand_owner', 'admin'), asyncHandler(ctrl.approveSubmissionHandler));
router.post('/:subId/reject', authenticate(), authorize('brand_owner', 'admin'), asyncHandler(ctrl.rejectSubmissionHandler));

export default router;
