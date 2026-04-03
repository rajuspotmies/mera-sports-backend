import * as admin from 'firebase-admin';
import { logger } from '../utils/logger';

let appInitialized = false;

/**
 * Initialize Firebase Admin SDK for FCM using only environment variables:
 * - FIREBASE_PROJECT_ID
 * - FIREBASE_CLIENT_EMAIL
 * - FIREBASE_PRIVATE_KEY (use \n for newlines in .env, e.g. "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n")
 */
export function initializeFcm() {
  if (appInitialized) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    logger.warn(
      'FCM disabled: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env (use \\n for newlines in private key).'
    );
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    appInitialized = true;
    logger.info('Firebase Admin SDK (FCM) initialized from environment variables.');
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK:', error);
  }
}

export function isFcmInitialized(): boolean {
  return appInitialized;
}

export interface SendPushResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
}

/**
 * Send a push notification to specific device tokens.
 * Returns invalid tokens so callers can remove them from the DB.
 *
 * @param category - iOS APS category / Android click_action that activates notification
 *   action buttons registered on the client. Supported values:
 *   - 'chat'     → "Mark as Read" button
 *   - 'campaign' → "View" button
 *   - 'payment'  → "View" button
 */
export async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
  category?: string
): Promise<SendPushResult | undefined> {
  if (!appInitialized) {
    logger.warn('FCM not initialized; push notification skipped.');
    return undefined;
  }

  if (tokens.length === 0) return { successCount: 0, failureCount: 0, invalidTokens: [] };

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: { title, body },
    data: data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : undefined,
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'default',
        // Enables notification action buttons registered on the client for this category
        ...(category ? { clickAction: category } : {}),
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          contentAvailable: true,
          // Tells iOS which UNNotificationCategory to use for action buttons
          ...(category ? { category } : {}),
        },
      },
      headers: {
        'apns-priority': '10',
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    const invalidTokens: string[] = [];

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(tokens[idx]);
            logger.debug('Stale FCM token marked for removal:', tokens[idx].slice(0, 20) + '…');
          }
        }
      });
    }

    logger.info(
      `FCM: sent ${response.successCount} messages; ${response.failureCount} failed; ${invalidTokens.length} invalid token(s).`
    );
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  } catch (error) {
    logger.error('Error sending FCM messages:', error);
    throw error;
  }
}
