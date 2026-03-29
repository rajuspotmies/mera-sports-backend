import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { upload, setUploadFolder } from '@/middleware/upload';
import { uploadLimiter, authLimiter } from '@/middleware/rateLimiter';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import { updateBrandSchema } from './brand.schema';
import * as ctrl from './brand.controller';
import * as authCtrl from '../auth/auth.controller';
import { registerSchema, loginSchema, updateMeSchema, forgotPasswordSchema, resetPasswordSchema, changePasswordSchema } from '../auth/auth.schema';

const router = Router();

// ─── Auth Routes (Role: brand_owner) ─────────────────────────────────────────

router.post('/auth/register', authLimiter, validate({ body: registerSchema }), asyncHandler(authCtrl.registerHandler('brand_owner')));
router.post('/auth/login', authLimiter, validate({ body: loginSchema }), asyncHandler(authCtrl.loginHandler('brand_owner')));
router.post('/auth/refresh', asyncHandler(authCtrl.refreshHandler('brand_owner')));
router.post('/auth/logout', asyncHandler(authCtrl.logoutHandler('brand_owner')));
router.post('/auth/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), asyncHandler(authCtrl.forgotPasswordHandler));
router.post('/auth/reset-password', authLimiter, validate({ body: resetPasswordSchema }), asyncHandler(authCtrl.resetPasswordHandler));

router.get('/auth/me', authenticate('brand_owner'), asyncHandler(authCtrl.getMeHandler));
router.put('/auth/me', authenticate('brand_owner'), validate({ body: updateMeSchema }), asyncHandler(authCtrl.updateMeHandler));
router.delete('/auth/me', authenticate('brand_owner'), asyncHandler(authCtrl.deleteMeHandler('brand_owner')));
router.post('/auth/change-password', authenticate('brand_owner'), validate({ body: changePasswordSchema }), asyncHandler(authCtrl.changePasswordHandler));

// ─── Protected Routes ────────────────────────────────────────────────────────

// All brand routes below require authentication + brand_owner (or admin) role
router.use(authenticate('brand_owner'), authorize('brand_owner', 'admin'));

router.get('/profile', asyncHandler(ctrl.getBrandProfileHandler));

router.put(
  '/profile',
  validate({ body: updateBrandSchema }),
  asyncHandler(ctrl.updateBrandProfileHandler)
);

router.post(
  '/profile/avatar',
  uploadLimiter,
  setUploadFolder('logos'),
  upload.single('avatar'),
  asyncHandler(ctrl.uploadBrandLogoHandler)
);

export default router;
