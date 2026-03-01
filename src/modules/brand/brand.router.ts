import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { upload, setUploadFolder } from '@/middleware/upload';
import { uploadLimiter } from '@/middleware/rateLimiter';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import { updateBrandSchema } from './brand.schema';
import * as ctrl from './brand.controller';

const router = Router();

// All brand routes require authentication + brand_owner (or admin) role
router.use(authenticate, authorize('brand_owner', 'admin'));

router.get('/profile', asyncHandler(ctrl.getBrandProfileHandler));

router.put(
  '/profile',
  validate({ body: updateBrandSchema }),
  asyncHandler(ctrl.updateBrandProfileHandler)
);

router.post(
  '/profile/logo',
  uploadLimiter,
  setUploadFolder('logos'),
  upload.single('file'),
  asyncHandler(ctrl.uploadBrandLogoHandler)
);

export default router;
