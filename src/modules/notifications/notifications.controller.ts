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

export async function registerTokenHandler(req: Request, res: Response): Promise<void> {
  const { token, deviceType } = req.body;
  if (!token) {
    res.status(400).json({ success: false, message: 'Token is required' });
    return;
  }
  await notificationsService.registerFcmToken(req.user.sub, token, deviceType);
  sendSuccess(res, { message: 'FCM token registered successfully' });
}

export async function sendTestNotificationHandler(req: Request, res: Response): Promise<void> {
  const targetUserId =
    req.body?.userId && req.user.role === 'admin' ? req.body.userId : req.user.sub;
  const result = await notificationsService.sendTestNotification(targetUserId);
  sendSuccess(res, result);
}
