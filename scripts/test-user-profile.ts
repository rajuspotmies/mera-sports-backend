import { db } from '../src/db';
import { users } from '../src/db/schema';
import { getMe } from '../src/modules/auth/auth.service';
import { getOwnInfluencerProfile } from '../src/modules/influencers/influencers.service';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

async function verifyProfiles() {
  const userId = 'e963f0c0-d8b9-4c1f-8b37-a73dbbedfe2c'; // Renuka Kumar
  console.log(`Verifying user: ${userId}`);

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }

  console.log('--- Testing authService.getMe ---');
  const me = await getMe(userId);
  console.log('Auth ME result:', JSON.stringify(me, null, 2));

  console.log('\n--- Testing influencersService.getOwnInfluencerProfile ---');
  const profile = await getOwnInfluencerProfile(userId);
  console.log('Profile result:', JSON.stringify(profile, null, 2));

  if (me.phoneNumber) {
    console.log('\n✅ authService.getMe includes phoneNumber:', me.phoneNumber);
  } else {
    console.warn('\n❌ authService.getMe is MISSING phoneNumber');
  }

  if (profile.userPhoneNumber) {
    console.log('✅ influencersService.getOwnInfluencerProfile includes userPhoneNumber:', profile.userPhoneNumber);
  } else {
    console.warn('❌ influencersService.getOwnInfluencerProfile is MISSING userPhoneNumber');
  }

  process.exit(0);
}

verifyProfiles().catch(console.error);
