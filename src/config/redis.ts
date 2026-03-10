import Redis from 'ioredis';
import { env } from './env';
import { logger } from '@/shared/utils/logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err) => {
  logger.error('Redis connection error', err);
});

export async function checkRedisConnection(): Promise<void> {
  await redis.connect();
  await redis.ping();
}
