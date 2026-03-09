import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import * as ctrl from './notifications.controller';

const router = Router();

router.use(authenticate());

router.get('/', asyncHandler(ctrl.listNotificationsHandler));
router.post('/:id/read', asyncHandler(ctrl.markReadHandler));
router.post('/read-all', asyncHandler(ctrl.markAllReadHandler));

export default router;
