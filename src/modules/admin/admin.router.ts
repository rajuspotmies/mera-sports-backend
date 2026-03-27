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
import {
  listUsersQuerySchema,
  updateUserStatusSchema,
  listAdminCampaignsQuerySchema,
  listReportsQuerySchema,
} from './admin.schema';
import * as adminCtrl from './admin.controller';

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

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

router.get('/stats', authenticate('admin'), asyncHandler(adminCtrl.getDashboardStatsHandler));

// ─── User Management ──────────────────────────────────────────────────────────

router.get(
  '/users',
  authenticate('admin'),
  validate({ query: listUsersQuerySchema }),
  asyncHandler(adminCtrl.listUsersHandler)
);

router.get('/users/:id', authenticate('admin'), asyncHandler(adminCtrl.getUserDetailHandler));

router.patch(
  '/users/:id/status',
  authenticate('admin'),
  validate({ body: updateUserStatusSchema }),
  asyncHandler(adminCtrl.updateUserStatusHandler)
);

// ─── Campaign Overview ────────────────────────────────────────────────────────

router.get(
  '/campaigns',
  authenticate('admin'),
  validate({ query: listAdminCampaignsQuerySchema }),
  asyncHandler(adminCtrl.listAdminCampaignsHandler)
);

router.get('/campaigns/:id', authenticate('admin'), asyncHandler(adminCtrl.getAdminCampaignDetailHandler));

// ─── Reports Management ───────────────────────────────────────────────────────

router.get(
  '/reports',
  authenticate('admin'),
  validate({ query: listReportsQuerySchema }),
  asyncHandler(adminCtrl.listReportsHandler)
);

router.patch('/reports/:id/resolve', authenticate('admin'), asyncHandler(adminCtrl.resolveReportHandler));

// ─── Bank Details (for settling influencers) ──────────────────────────────────

router.get(
  '/influencers/:influencerUserId/bank-details',
  authenticate('admin'),
  asyncHandler(adminCtrl.getInfluencerBankDetailsHandler)
);

export default router;
