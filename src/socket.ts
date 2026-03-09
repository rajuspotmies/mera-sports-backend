import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env';
import { logger } from './shared/utils/logger';
import type { JWTPayload } from './shared/types/api';

let io: SocketIOServer;

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
    const token = socket.handshake.auth?.token as string | undefined;
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

    socket.on('JOIN_CAMPAIGN', (campaignId: string) => {
      socket.join(`campaign:${campaignId}`);
      logger.debug(`${user.sub} joined campaign:${campaignId}`);
    });

    socket.on('LEAVE_CAMPAIGN', (campaignId: string) => {
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
