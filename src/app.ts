import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { env } from './config/env';
import { UPLOAD_ROOT } from './config/storage';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';

// Routers
import authRouter from './modules/auth/auth.router';
import brandRouter from './modules/brand/brand.router';
import influencersRouter from './modules/influencers/influencers.router';
import campaignsRouter from './modules/campaigns/campaigns.router';
import notificationsRouter from './modules/notifications/notifications.router';
import messagesRouter from './modules/messages/messages.router';
import analyticsRouter from './modules/analytics/analytics.router';
import aiRouter from './modules/ai/ai.router';

export function createApp() {
  const app = express();

  // ─── Security ─────────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'"],
        },
      },
    })
  );

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ─── Body parsing ─────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ─── Static file serving (uploaded files) ─────────────────────────────────
  app.use(
    '/files',
    express.static(UPLOAD_ROOT, {
      maxAge: '7d',
      etag: true,
    })
  );

  // ─── Health check (no auth, no rate limit) ───────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ─── API routes ───────────────────────────────────────────────────────────
  app.use('/api/v1', apiLimiter);

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/brand', brandRouter);
  app.use('/api/v1/influencers', influencersRouter);
  app.use('/api/v1/campaigns', campaignsRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/messages', messagesRouter);
  app.use('/api/v1/analytics', analyticsRouter);
  app.use('/api/v1/ai', aiRouter);

  // ─── 404 handler ──────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // ─── Global error handler ─────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
