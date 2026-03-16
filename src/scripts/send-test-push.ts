/**
 * One-off script: send a test push notification to a user's registered FCM tokens.
 * Usage: pnpm exec tsx src/scripts/send-test-push.ts <userId>
 */
import 'dotenv/config';
import { checkDatabaseConnection } from '@/config/database';
import { initializeFcm } from '@/shared/services/fcm.service';
import { sendTestNotification } from '@/modules/notifications/notifications.service';
import { logger } from '@/shared/utils/logger';

const userId = process.argv[2] || 'e963f0c0-d8b9-4c1f-8b37-a73dbbedfe2c';

async function main() {
  await checkDatabaseConnection();
  initializeFcm();
  const result = await sendTestNotification(userId);
  logger.info('Send test result', result);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
