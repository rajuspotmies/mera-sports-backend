import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { validate } from '@/middleware/validate';
import { authLimiter } from '@/middleware/rateLimiter';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import * as authCtrl from '../auth/auth.controller';
import { loginSchema, updateMeSchema } from '../auth/auth.schema';

const router = Router();

// ─── Auth Routes (Role: admin) ───────────────────────────────────────────────

// Note: No public registration endpoint for admins
router.post('/auth/login', authLimiter, validate({ body: loginSchema }), asyncHandler(authCtrl.loginHandler('admin')));
router.post('/auth/refresh', asyncHandler(authCtrl.refreshHandler('admin')));
router.post('/auth/logout', asyncHandler(authCtrl.logoutHandler('admin')));

router.get('/auth/me', authenticate('admin'), asyncHandler(authCtrl.getMeHandler));
router.put('/auth/me', authenticate('admin'), validate({ body: updateMeSchema }), asyncHandler(authCtrl.updateMeHandler));
router.delete('/auth/me', authenticate('admin'), asyncHandler(authCtrl.deleteMeHandler('admin')));

export default router;
