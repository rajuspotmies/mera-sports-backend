import type { Request, Response } from 'express';
import * as messagesService from './messages.service';
import { sendSuccess, sendCreated } from '@/shared/utils/response';
import { z } from 'zod';

const sendMessageBody = z.object({ content: z.string().min(1).max(5000) });

export async function listConversationsHandler(req: Request, res: Response): Promise<void> {
  const result = await messagesService.listConversations(req.user);
  sendSuccess(res, result);
}

export async function getConversationHandler(req: Request, res: Response): Promise<void> {
  const result = await messagesService.getConversation(req.params.id, req.user, req.query as never);
  sendSuccess(res, result);
}

export async function sendMessageHandler(req: Request, res: Response): Promise<void> {
  const { content } = sendMessageBody.parse(req.body);
  const result = await messagesService.sendMessage(req.params.id, req.user, content);
  sendCreated(res, result);
}
