import * as admin from 'firebase-admin';
import { logger } from '../utils/logger';

// We initialize the app only once
let appInitialized = false;

export function initializeFcm() {
  if (appInitialized) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Handle newlines in private key from .env
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    logger.warn('FCM credentials missing from environment variables. Push notifications will be disabled.');
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
    logger.info('Firebase Admin SDK initialized successfully.');
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK:', error);
  }
}

/**
 * Send a push notification to specific device tokens
 */
export async function sendPushNotification(tokens: string[], title: string, body: string, data?: Record<string, string>) {
  if (!appInitialized) {
    logger.warn('Attempted to send push notification but FCM is not initialized.');
    return;
  }

  if (tokens.length === 0) return;

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: {
      title,
      body,
    },
    data,
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    logger.info(`FCM: Successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);
    
    // Potential follow-up: Identify and remove invalid tokens
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (errorCode === 'messaging/invalid-registration-token' || errorCode === 'messaging/registration-token-not-registered') {
             // TODO: Remove stale token from DB
             logger.debug(`Stale token found at index ${idx}: ${tokens[idx]}`);
          }
        }
      });
    }
    
    return response;
  } catch (error) {
    logger.error('Error sending FCM messages:', error);
    throw error;
  }
}
