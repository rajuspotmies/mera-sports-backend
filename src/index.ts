import http from 'http';
import { createApp } from './app';
import { initSocketServer } from './socket';
import { env } from './config/env';
import { checkDatabaseConnection } from './config/database';
import { checkRedisConnection } from './config/redis';
import { ensureUploadDirs } from './config/storage';
import { logger } from './shared/utils/logger';
import { startWorkers } from './jobs';

async function main() {
  // ─── Startup checks ────────────────────────────────────────────────────────
  logger.info('Starting MutinyX backend...');

  try {
    await checkDatabaseConnection();
    logger.info('PostgreSQL connected');
  } catch (err) {
    logger.error('Failed to connect to PostgreSQL', { err });
    process.exit(1);
  }

  try {
    await checkRedisConnection();
    logger.info('Redis connected');
  } catch (err) {
    logger.warn('Redis connection failed — some features may be limited', { err });
  }

  ensureUploadDirs();
  logger.info(`Upload directories ready at ${env.UPLOAD_PATH}`);

  // Start background workers
  startWorkers();

  // ─── Server setup ──────────────────────────────────────────────────────────
  const app = createApp();
  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`Health check: http://localhost:${env.PORT}/health`);
  });

  // ─── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    // Force exit if graceful shutdown takes too long
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
