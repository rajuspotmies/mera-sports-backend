import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { upload, setUploadFolder } from '@/middleware/upload';
import { uploadLimiter } from '@/middleware/rateLimiter';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import * as ctrl from './scripts.controller';

// Mounted at /campaigns/:campaignId/scripts
const router = Router({ mergeParams: true });

router.get('/', authenticate(), authorize('brand_owner', 'admin'), asyncHandler(ctrl.listScriptsHandler));

router.post(
  '/',
  authenticate(),
  authorize('influencer'),
  uploadLimiter,
  setUploadFolder('scripts'),
  upload.single('file'),
  asyncHandler(ctrl.submitScriptHandler)
);

router.post('/:scriptId/approve', authenticate(), authorize('brand_owner', 'admin'), asyncHandler(ctrl.approveScriptHandler));
router.post('/:scriptId/revise', authenticate(), authorize('brand_owner', 'admin'), asyncHandler(ctrl.requestRevisionHandler));

export default router;
