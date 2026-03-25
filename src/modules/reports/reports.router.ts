import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import { createReportSchema, createBlockSchema } from './reports.schema';
import * as ctrl from './reports.controller';

const router = Router();

// Require authentication for all reporting/blocking actions
router.use(authenticate());

/**
 * @route POST /api/v1/reports
 * @desc Report a brand or influencer
 */
router.post(
  '/',
  validate({ body: createReportSchema }),
  asyncHandler(ctrl.createReportHandler)
);

/**
 * @route POST /api/v1/reports/blocks
 * @desc Block a brand or influencer
 */
router.post(
  '/blocks',
  validate({ body: createBlockSchema }),
  asyncHandler(ctrl.blockUserHandler)
);

/**
 * @route DELETE /api/v1/reports/blocks/:targetId
 * @desc Unblock a brand or influencer
 */
router.delete(
  '/blocks/:targetId',
  asyncHandler(ctrl.unblockUserHandler)
);

export default router;
