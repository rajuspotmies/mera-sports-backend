import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import * as ctrl from './messages.controller';

const router = Router();

router.use(authenticate());

router.post('/start', asyncHandler(ctrl.startConversationHandler));
router.get('/', asyncHandler(ctrl.listConversationsHandler));
router.get('/:id', asyncHandler(ctrl.getConversationHandler));
router.post('/:id', asyncHandler(ctrl.sendMessageHandler));

export default router;
