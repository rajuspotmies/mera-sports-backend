import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export async function checkRedisConnection(): Promise<void> {
  await redis.connect();
  await redis.ping();
}
