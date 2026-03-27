import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import { connectSocialSchema, disconnectSocialSchema } from './social.schema';
import * as ctrl from './social.controller';

const router = Router();

// POST /api/v1/influencers/social/connect
// Receives short-lived Facebook access token, exchanges it, fetches Instagram stats, saves all.
router.post(
  '/connect',
  authenticate('influencer'),
  validate({ body: connectSocialSchema }),
  asyncHandler(ctrl.connectSocialHandler),
);

// POST /api/v1/influencers/social/disconnect
// Clears the token and marks the platform as disconnected.
router.post(
  '/disconnect',
  authenticate('influencer'),
  validate({ body: disconnectSocialSchema }),
  asyncHandler(ctrl.disconnectSocialHandler),
);

// GET /api/v1/influencers/social/status
// Returns connection status for all platforms (no tokens exposed).
router.get(
  '/status',
  authenticate('influencer'),
  asyncHandler(ctrl.getSocialStatusHandler),
);

export default router;
