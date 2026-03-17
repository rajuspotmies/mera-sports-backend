import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { validate } from '@/middleware/validate';
import { authLimiter } from '@/middleware/rateLimiter';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import * as authCtrl from '../auth/auth.controller';
import { loginSchema, updateMeSchema } from '../auth/auth.schema';
import { settleInfluencerSchema, listSettlementsQuerySchema } from './settlements.schema';
import * as settlementsCtrl from './settlements.controller';

const router = Router();

// ─── Auth Routes (Role: admin) ───────────────────────────────────────────────

router.post('/auth/login', authLimiter, validate({ body: loginSchema }), asyncHandler(authCtrl.loginHandler('admin')));
router.post('/auth/refresh', asyncHandler(authCtrl.refreshHandler('admin')));
router.post('/auth/logout', asyncHandler(authCtrl.logoutHandler('admin')));

router.get('/auth/me', authenticate('admin'), asyncHandler(authCtrl.getMeHandler));
router.put('/auth/me', authenticate('admin'), validate({ body: updateMeSchema }), asyncHandler(authCtrl.updateMeHandler));
router.delete('/auth/me', authenticate('admin'), asyncHandler(authCtrl.deleteMeHandler('admin')));

// ─── Settlement Routes (admin only) ─────────────────────────────────────────

router.get(
  '/settlements/unsettled',
  authenticate('admin'),
  validate({ query: listSettlementsQuerySchema }),
  asyncHandler(settlementsCtrl.listUnsettledHandler)
);

router.get(
  '/settlements',
  authenticate('admin'),
  validate({ query: listSettlementsQuerySchema }),
  asyncHandler(settlementsCtrl.listSettlementsHandler)
);

router.post(
  '/settlements/:ciId',
  authenticate('admin'),
  validate({ body: settleInfluencerSchema }),
  asyncHandler(settlementsCtrl.settleInfluencerHandler)
);

export default router;
