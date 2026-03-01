import winston from 'winston';
import { env } from '@/config/env';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const isDev = env.NODE_ENV === 'development';

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    isDev
      ? combine(colorize(), simple())
      : json()
  ),
  transports: [new winston.transports.Console()],
});
