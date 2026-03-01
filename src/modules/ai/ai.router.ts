import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { aiLimiter } from '@/middleware/rateLimiter';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import * as ctrl from './ai.controller';

const router = Router();

router.use(authenticate);

router.post(
    '/strategist',
    authorize('brand_owner', 'admin'),
    aiLimiter,
    ctrl.strategistHandler // Not wrapped in asyncHandler because it directly handles SSE stream errors
);

router.post(
    '/smart-select',
    authorize('brand_owner', 'admin'),
    aiLimiter,
    asyncHandler(ctrl.smartSelectHandler)
);

export default router;
