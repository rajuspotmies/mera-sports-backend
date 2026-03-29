import { db } from '../src/db';
import { users, fcmTokens } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { sendPushNotification } from '../src/shared/services/fcm.service';
import { initializeFcm } from '../src/shared/services/fcm.service';
import dotenv from 'dotenv';

dotenv.config();

async function testPush() {
  const targetPhone = process.argv[2] || '+917032952586';
  console.log(`Testing push for phone: ${targetPhone}`);

  initializeFcm();

  const [user] = await db.select().from(users).where(eq(users.phoneNumber, targetPhone)).limit(1);
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }

  const tokens = await db
    .select({ token: fcmTokens.token, deviceType: fcmTokens.deviceType })
    .from(fcmTokens)
    .where(eq(fcmTokens.userId, user.id));

  if (tokens.length === 0) {
    console.error('No FCM tokens found for user');
    process.exit(1);
  }

  console.log(`Found ${tokens.length} tokens:`, tokens);

  const result = await sendPushNotification(
    tokens.map(t => t.token),
    'Test iOS Push',
    'If you see this, iOS optimization is working!',
    { type: 'test', priority: 'high' }
  );

  console.log('FCM Result:', result);
  process.exit(0);
}

testPush().catch(console.error);
