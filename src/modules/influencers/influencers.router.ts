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
  inviteInfluencersSchema,
  addPortfolioItemSchema,
  updatePortfolioItemSchema,
} from './influencers.schema';
import * as ctrl from './influencers.controller';
import * as authCtrl from '../auth/auth.controller';
import { updateMeSchema, sendOtpSchema, verifyOtpSchema } from '../auth/auth.schema';
import { getMyApplicationsHandler } from '../applications/applications.controller';
import { listApplicationsQuerySchema } from '../applications/applications.schema';

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

router.post(
  '/profile/portfolio-media',
  authenticate('influencer'),
  uploadLimiter,
  setUploadFolder('portfolio'),
  upload.array('files', 10),
  asyncHandler(ctrl.uploadPortfolioMediaHandler)
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

// ─── My applications (campaigns invited to or applied to) ───────────────────────
router.get(
  '/applications',
  authenticate('influencer'),
  validate({ query: listApplicationsQuerySchema }),
  asyncHandler(getMyApplicationsHandler)
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

// ─── Invites (brand sends — accepts 1–50 influencerIds in one call) ──────────
router.post(
  '/invite',
  authenticate(),
  authorize('brand_owner', 'admin'),
  validate({ body: inviteInfluencersSchema }),
  asyncHandler(ctrl.inviteInfluencersHandler)
);

// ─── Bank Details (influencer manages own) ───────────────────────────────────
import { upsertBankDetailsSchema } from './bank-details/bank-details.schema';
import * as bankDetailsCtrl from './bank-details/bank-details.controller';

router.get(
  '/bank-details',
  authenticate('influencer'),
  asyncHandler(bankDetailsCtrl.getOwnBankDetailsHandler)
);

router.post(
  '/bank-details',
  authenticate('influencer'),
  validate({ body: upsertBankDetailsSchema }),
  asyncHandler(bankDetailsCtrl.createBankDetailsHandler)
);

router.put(
  '/bank-details',
  authenticate('influencer'),
  validate({ body: upsertBankDetailsSchema }),
  asyncHandler(bankDetailsCtrl.updateBankDetailsHandler)
);

router.delete(
  '/bank-details',
  authenticate('influencer'),
  asyncHandler(bankDetailsCtrl.deleteBankDetailsHandler)
);

export default router;
