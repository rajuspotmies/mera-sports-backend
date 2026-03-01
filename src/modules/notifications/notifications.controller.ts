import type { Request, Response } from 'express';
import * as notificationsService from './notifications.service';
import { sendSuccess } from '@/shared/utils/response';

export async function listNotificationsHandler(req: Request, res: Response): Promise<void> {
  const { notifications, meta, unreadCount } = await notificationsService.listNotifications(
    req.user.sub,
    req.query as never
  );
  res.json({ success: true, data: notifications, meta, unreadCount });
}

export async function markReadHandler(req: Request, res: Response): Promise<void> {
  const result = await notificationsService.markNotificationRead(req.params.id, req.user.sub);
  sendSuccess(res, result);
}

export async function markAllReadHandler(req: Request, res: Response): Promise<void> {
  await notificationsService.markAllNotificationsRead(req.user.sub);
  sendSuccess(res, { message: 'All notifications marked as read' });
}
