import Queue from 'bull';
import { env } from '@/config/env';

export const emailQueue = new Queue('mutiny_emails', env.REDIS_URL || 'redis://localhost:6379');
export const notificationQueue = new Queue('mutiny_notifications', env.REDIS_URL || 'redis://localhost:6379');

// Optional: Add global event listeners for queue error logging
emailQueue.on('error', (error) => {
    console.error('Email queue error', error);
});

notificationQueue.on('error', (error) => {
    console.error('Notification queue error', error);
});
