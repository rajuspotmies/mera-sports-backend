import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import * as ctrl from './notifications.controller';

const router = Router();

router.use(authenticate());

router.get('/', asyncHandler(ctrl.listNotificationsHandler));
router.post('/send-test', asyncHandler(ctrl.sendTestNotificationHandler)); // body: { userId? } — admin can send to specific user
router.post('/read-all', asyncHandler(ctrl.markAllReadHandler));
router.post('/register-token', asyncHandler(ctrl.registerTokenHandler));
router.post('/:id/read', asyncHandler(ctrl.markReadHandler));

export default router;
