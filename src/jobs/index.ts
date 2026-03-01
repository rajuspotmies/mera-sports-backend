import { emailQueue, notificationQueue } from './queue';
import { processEmailJob } from './processors/email.processor';
import { processNotificationJob } from './processors/notification.processor';

export function startWorkers() {
    // Start consuming jobs with processors
    emailQueue.process(processEmailJob);
    notificationQueue.process(processNotificationJob);
    console.log('[Jobs] Workers started successfully');
}
