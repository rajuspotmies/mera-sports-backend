import { emailQueue, notificationQueue } from './queue';
import { processEmailJob } from './processors/email.processor';
import { processNotificationJob } from './processors/notification.processor';
import { logger } from '@/shared/utils/logger';

export function startWorkers() {
    // Start consuming jobs with processors
    emailQueue.process(processEmailJob);
    notificationQueue.process(processNotificationJob);

    notificationQueue.on('completed', (job) => {
        logger.debug(`[Jobs] Notification completed: ${job.id}`);
    });
    notificationQueue.on('failed', (job, err) => {
        logger.error(`[Jobs] Notification failed: ${job?.id}`, err);
    });

    console.log('[Jobs] Workers started successfully');
}
