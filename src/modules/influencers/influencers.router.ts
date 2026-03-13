import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { upload, setUploadFolder } from '@/middleware/upload';
import { uploadLimiter, authLimiter } from '@/middleware/rateLimiter';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import {
  updateInfluencerProfileSchema,
  searchInfluencersSchema,
  inviteInfluencerSchema,
  bulkInviteSchema,
  addPortfolioItemSchema,
  updatePortfolioItemSchema,
} from './influencers.schema';
import * as ctrl from './influencers.controller';
import * as authCtrl from '../auth/auth.controller';
import { updateMeSchema, sendOtpSchema, verifyOtpSchema } from '../auth/auth.schema';

const router = Router();

// ─── Auth Routes (Role: influencer) ──────────────────────────────────────────
// Note: Influencers use OTP-based authentication (phone number)

router.post('/auth/send-otp', authLimiter, validate({ body: sendOtpSchema }), asyncHandler(authCtrl.sendOtpHandler));
router.post('/auth/verify-otp', authLimiter, validate({ body: verifyOtpSchema }), asyncHandler(authCtrl.verifyOtpHandler('influencer')));
router.post('/auth/refresh', asyncHandler(authCtrl.refreshHandler('influencer')));
router.post('/auth/logout', asyncHandler(authCtrl.logoutHandler('influencer')));

router.get('/auth/me', authenticate('influencer'), asyncHandler(authCtrl.getMeHandler));
router.put('/auth/me', authenticate('influencer'), validate({ body: updateMeSchema }), asyncHandler(authCtrl.updateMeHandler));
router.delete('/auth/me', authenticate('influencer'), asyncHandler(authCtrl.deleteMeHandler('influencer')));

// ─── Influencer own profile ──────────────────────────────────────────────────
router.get(
  '/profile',
  authenticate('influencer'),
  asyncHandler(ctrl.getOwnProfileHandler)
);

router.put(
  '/profile',
  authenticate('influencer'),
  validate({ body: updateInfluencerProfileSchema }),
  asyncHandler(ctrl.updateOwnProfileHandler)
);

router.post(
  '/profile/avatar',
  authenticate('influencer'),
  uploadLimiter,
  setUploadFolder('avatars'),
  upload.single('file'),
  asyncHandler(ctrl.uploadAvatarHandler)
);

// ─── Portfolio ───────────────────────────────────────────────────────────────
router.post(
  '/portfolio',
  authenticate('influencer'),
  validate({ body: addPortfolioItemSchema }),
  asyncHandler(ctrl.addPortfolioItemHandler)
);

router.patch(
  '/portfolio/:itemId',
  authenticate('influencer'),
  validate({ body: updatePortfolioItemSchema }),
  asyncHandler(ctrl.updatePortfolioItemHandler)
);

router.delete(
  '/portfolio/:itemId',
  authenticate('influencer'),
  asyncHandler(ctrl.deletePortfolioItemHandler)
);

// ─── Discover (used by brands + admin) ───────────────────────────────────────
// These routes accept any authenticated user, then authorize checks the role
router.get(
  '/search',
  authenticate(),
  authorize('brand_owner', 'admin'),
  validate({ query: searchInfluencersSchema }),
  asyncHandler(ctrl.searchInfluencersHandler)
);

router.get(
  '/:id',
  authenticate(),
  asyncHandler(ctrl.getInfluencerByIdHandler)
);

// ─── Invites (brand sends) ────────────────────────────────────────────────────
router.post(
  '/invite',
  authenticate(),
  authorize('brand_owner', 'admin'),
  validate({ body: inviteInfluencerSchema }),
  asyncHandler(ctrl.inviteInfluencerHandler)
);

router.post(
  '/bulk-invite',
  authenticate(),
  authorize('brand_owner', 'admin'),
  validate({ body: bulkInviteSchema }),
  asyncHandler(ctrl.bulkInviteHandler)
);

export default router;
