import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { upload, setUploadFolder } from '@/middleware/upload';
import { uploadLimiter } from '@/middleware/rateLimiter';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import {
  updateInfluencerProfileSchema,
  searchInfluencersSchema,
  inviteInfluencerSchema,
  bulkInviteSchema,
} from './influencers.schema';
import * as ctrl from './influencers.controller';

const router = Router();

// ─── Influencer own profile ──────────────────────────────────────────────────
router.get(
  '/profile',
  authenticate,
  authorize('influencer'),
  asyncHandler(ctrl.getOwnProfileHandler)
);

router.put(
  '/profile',
  authenticate,
  authorize('influencer'),
  validate({ body: updateInfluencerProfileSchema }),
  asyncHandler(ctrl.updateOwnProfileHandler)
);

router.post(
  '/profile/avatar',
  authenticate,
  authorize('influencer'),
  uploadLimiter,
  setUploadFolder('avatars'),
  upload.single('file'),
  asyncHandler(ctrl.uploadAvatarHandler)
);

// ─── Discover (used by brands + admin) ───────────────────────────────────────
router.get(
  '/search',
  authenticate,
  authorize('brand_owner', 'admin'),
  validate({ query: searchInfluencersSchema }),
  asyncHandler(ctrl.searchInfluencersHandler)
);

router.get(
  '/:id',
  authenticate,
  asyncHandler(ctrl.getInfluencerByIdHandler)
);

// ─── Invites (brand sends) ────────────────────────────────────────────────────
router.post(
  '/invite',
  authenticate,
  authorize('brand_owner', 'admin'),
  validate({ body: inviteInfluencerSchema }),
  asyncHandler(ctrl.inviteInfluencerHandler)
);

router.post(
  '/bulk-invite',
  authenticate,
  authorize('brand_owner', 'admin'),
  validate({ body: bulkInviteSchema }),
  asyncHandler(ctrl.bulkInviteHandler)
);

export default router;
