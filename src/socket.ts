import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env';
import { logger } from './shared/utils/logger';
import type { JWTPayload } from './shared/types/api';

let io: SocketIOServer;

const ACCESS_COOKIES = [
  'brand_owner_access_token',
  'influencer_access_token',
  'admin_access_token',
] as const;

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey || rest.length === 0) return acc;
    acc[rawKey] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.FRONTEND_URLS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // JWT authentication for every WS connection
  io.use((socket, next) => {
    let token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      for (const key of ACCESS_COOKIES) {
        if (cookies[key]) {
          token = cookies[key];
          break;
        }
      }
    }
    if (!token) {
      return next(new Error('Unauthorized: no token provided'));
    }
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Unauthorized: invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as JWTPayload;
    logger.info(`WS connected: ${user.sub} (${user.role})`);

    // Join personal notification room
    socket.join(`user:${user.sub}`);

    socket.on('JOIN_CAMPAIGN', (payload: string | { campaignId?: string }) => {
      const campaignId =
        typeof payload === 'string'
          ? payload
          : String(payload?.campaignId ?? '');
      if (!campaignId) return;
      socket.join(`campaign:${campaignId}`);
      logger.debug(`${user.sub} joined campaign:${campaignId}`);
    });

    socket.on('LEAVE_CAMPAIGN', (payload: string | { campaignId?: string }) => {
      const campaignId =
        typeof payload === 'string'
          ? payload
          : String(payload?.campaignId ?? '');
      if (!campaignId) return;
      socket.leave(`campaign:${campaignId}`);
    });

    socket.on('TYPING_START', (data: { conversationId: string; recipientUserId: string }) => {
      emitToUser(data.recipientUserId, 'TYPING_START', {
        conversationId: data.conversationId,
        userId: user.sub,
      });
    });

    socket.on('TYPING_STOP', (data: { conversationId: string; recipientUserId: string }) => {
      emitToUser(data.recipientUserId, 'TYPING_STOP', {
        conversationId: data.conversationId,
        userId: user.sub,
      });
    });

    socket.on('SEND_MESSAGE', async (_data: { conversationId: string; content: string }) => {
      // Message sending is handled via REST — WS only emits the result
      // The REST handler should call emitToConversation after saving
    });

    socket.on('MARK_READ', async (_conversationId: string) => {
      // Handled via REST
    });

    socket.on('disconnect', (reason) => {
      logger.info(`WS disconnected: ${user.sub} — ${reason}`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

// ─── Emit helpers (called from services) ─────────────────────────────────────

export function emitToUser(userId: string, event: string, data: unknown): void {
  getIO().to(`user:${userId}`).emit(event, data);
}

export function emitToCampaign(campaignId: string, event: string, data: unknown): void {
  getIO().to(`campaign:${campaignId}`).emit(event, data);
}
