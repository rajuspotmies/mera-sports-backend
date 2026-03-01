import { Job } from 'bull';
import { db } from '@/db';
import { notifications } from '@/db/schema';

export async function processNotificationJob(job: Job) {
    // Notification job processing
    // At the moment, basic notifications are already saved to db & emitted via WS
    // This queue could be used for pushed notifications to devices or batched processing
    const { data } = job;

    try {
        if (data.action === 'log') {
            console.log('Background notification task processed for:', data.userId);
        }

        // We can create notification records asynchronously here if we offload it from main thread
        if (data.action === 'create') {
            await db.insert(notifications).values({
                userId: data.userId,
                type: data.type,
                title: data.title,
                message: data.message,
                campaignId: data.campaignId,
                influencerId: data.influencerId,
                actionUrl: data.actionUrl,
            });
            // Note: we might emit websocket here if we have a Pub/Sub setup or standard IO emitter
        }

    } catch (error) {
        console.error('Notification processing failed', error);
        throw error;
    }
}
