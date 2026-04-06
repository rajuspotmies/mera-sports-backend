import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import { swaggerSpec } from './swagger';

// Routers
import adminRouter from './modules/admin/admin.router';
import brandRouter from './modules/brand/brand.router';
import influencersRouter from './modules/influencers/influencers.router';
import campaignsRouter from './modules/campaigns/campaigns.router';
import notificationsRouter from './modules/notifications/notifications.router';
import messagesRouter from './modules/messages/messages.router';
import analyticsRouter from './modules/analytics/analytics.router';
import aiRouter from './modules/ai/ai.router';
import uploadsRouter from './modules/uploads/uploads.router';
import reportsRouter from './modules/reports/reports.router';
import socialRouter from './modules/social/social.router';
import { asyncHandler } from './shared/utils/asyncHandler';
import { cashfreeWebhookHandler } from './modules/payments/payments.controller';

function resolveTrustProxySetting(): boolean | number {
  // Explicit env has highest priority so deployments can tune multi-proxy setups.
  const raw = env.TRUST_PROXY?.trim();
  if (raw) {
    if (raw.toLowerCase() === 'true') return true;
    if (raw.toLowerCase() === 'false') return false;
    const hopCount = Number(raw);
    if (Number.isInteger(hopCount) && hopCount >= 0) return hopCount;
  }

  // Sensible default for production behind one reverse proxy.
  return env.NODE_ENV === 'production' ? 1 : false;
}

export function createApp() {
  const app = express();

  // Required for correct client IP extraction behind load balancers/CDNs.
  app.set('trust proxy', resolveTrustProxySetting());

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
      origin: env.FRONTEND_URLS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Client'],
    })
  );

  // ─── Body parsing ─────────────────────────────────────────────────────────
  app.use(express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // ─── Static file serving (uploaded files) ─────────────────────────────────
  // No longer needed: files are served directly from S3 / Railway Buckets

  // ─── API docs ─────────────────────────────────────────────────────────────
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

  // ─── Health check (no auth, no rate limit) ───────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ─── Payment webhooks (no auth) ───────────────────────────────────────────
  // Global webhook endpoint for Cashfree callbacks.
  app.post('/api/v1/payments/webhook/cashfree', asyncHandler(cashfreeWebhookHandler));

  // ─── API routes ───────────────────────────────────────────────────────────
  app.use('/api/v1', apiLimiter);

  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/brand', brandRouter);
  app.use('/api/v1/influencers', influencersRouter);
  app.use('/api/v1/campaigns', campaignsRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/messages', messagesRouter);
  app.use('/api/v1/analytics', analyticsRouter);
  app.use('/api/v1/ai', aiRouter);
  app.use('/api/v1/uploads', uploadsRouter);
  app.use('/api/v1/reports', reportsRouter);
  app.use('/api/v1/influencers/social', socialRouter);

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
