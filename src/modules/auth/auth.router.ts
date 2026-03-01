import { Router } from 'express';
import { validate } from '@/middleware/validate';
import { authenticate } from '@/middleware/authenticate';
import { authLimiter } from '@/middleware/rateLimiter';
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from './auth.schema';
import * as ctrl from './auth.controller';
import { asyncHandler } from '@/shared/utils/asyncHandler';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), asyncHandler(ctrl.registerHandler));
router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(ctrl.loginHandler));
router.post('/refresh', validate({ body: refreshSchema }), asyncHandler(ctrl.refreshHandler));
router.post('/logout', validate({ body: logoutSchema }), asyncHandler(ctrl.logoutHandler));
router.get('/me', authenticate, asyncHandler(ctrl.getMeHandler));

export default router;
