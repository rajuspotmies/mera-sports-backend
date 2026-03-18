/**
 * Seed the App Store / Play Store review account.
 *
 * This creates (or updates) a dedicated influencer account that Apple/Google
 * reviewers can log into using a fixed phone number and OTP.
 *
 * Safe to run multiple times — uses upserts, never deletes existing data.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/seed-review-account.ts
 *
 * Env vars (with defaults):
 *   REVIEW_ACCOUNT_PHONE  = +911234567890
 *   REVIEW_ACCOUNT_OTP    = 000000
 */

import 'dotenv/config';
import { db } from '@/db';
import { users, influencerProfiles, influencerPortfolios, campaigns, campaignInfluencers, brandProfiles } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const PHONE = process.env.REVIEW_ACCOUNT_PHONE || '+911234567890';
const OTP = process.env.REVIEW_ACCOUNT_OTP || '000000';

async function main() {
  console.log(`\n🔧 Setting up review account: ${PHONE} (OTP: ${OTP})\n`);

  // ── 1. Upsert user ──────────────────────────────────────────────────────────
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.phoneNumber, PHONE))
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        phoneNumber: PHONE,
        email: `review-account@mutiny.app`,
        passwordHash: '',
        name: 'Ananya Verma',
        role: 'influencer',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        isVerified: true,
        isActive: true,
      })
      .returning();
    console.log('  ✅ Created user');
  } else {
    await db
      .update(users)
      .set({
        name: 'Ananya Verma',
        role: 'influencer',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
        isVerified: true,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    console.log('  ✅ Updated existing user');
  }

  // ── 2. Upsert influencer profile ───────────────────────────────────────────
  let [profile] = await db
    .select()
    .from(influencerProfiles)
    .where(eq(influencerProfiles.userId, user.id))
    .limit(1);

  const profileData = {
    handle: '@ananyaverma',
    bio: 'Lifestyle & beauty creator from Mumbai 🌸 Sharing everyday skincare, fashion hauls, and honest reviews. Collaborating with brands I genuinely love.',
    location: 'Mumbai, India',
    niches: ['Beauty', 'Skincare', 'Lifestyle', 'Fashion'],
    tier: 'micro' as const,
    followerCount: 52000,
    engagementRate: '4.80',
    platforms: [
      { platform: 'instagram', handle: '@ananyaverma', followers: 52000 },
      { platform: 'youtube', handle: 'AnanyaVermaa', followers: 8200 },
    ],
    rateCard: {
      instagram_reel: 10000,
      instagram_post: 6000,
      instagram_story: 3000,
      youtube_video: 25000,
    } as Record<string, number>,
    portfolioUrls: [
      'https://www.instagram.com/p/example1/',
      'https://www.instagram.com/p/example2/',
      'https://www.youtube.com/watch?v=example3',
    ],
    isVerified: true,
  };

  if (!profile) {
    [profile] = await db
      .insert(influencerProfiles)
      .values({ userId: user.id, ...profileData })
      .returning();
    console.log('  ✅ Created influencer profile');
  } else {
    await db
      .update(influencerProfiles)
      .set({ ...profileData, updatedAt: new Date() })
      .where(eq(influencerProfiles.id, profile.id));
    console.log('  ✅ Updated influencer profile');
  }

  // ── 3. Portfolio items ────────────────────────────────────────────────────
  const portfolioItems = [
    {
      title: 'Summer Skincare Routine',
      description: 'My complete AM/PM skincare routine for Indian summers — featuring SPF, serums, and lightweight moisturizers.',
      mediaUrl: 'https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=600',
      mediaType: 'image' as const,
      externalUrl: 'https://www.instagram.com/reel/example1/',
    },
    {
      title: 'Ethnic Wear Haul — Festive Season',
      description: 'Styling 5 festive outfits under ₹2000 each. Partnership with a homegrown brand.',
      mediaUrl: 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=600',
      mediaType: 'image' as const,
      externalUrl: 'https://www.instagram.com/reel/example2/',
    },
    {
      title: 'Honest Review: New Launch Serum',
      description: 'Tried this viral serum for 30 days — here is what actually happened to my skin.',
      mediaUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600',
      mediaType: 'image' as const,
      externalUrl: 'https://www.youtube.com/watch?v=example3',
    },
    {
      title: 'Day in My Life — Creator Edition',
      description: 'BTS of how I plan, shoot, and edit content. A peek into my daily routine as a full-time creator.',
      mediaUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600',
      mediaType: 'video' as const,
      externalUrl: 'https://www.youtube.com/watch?v=example4',
    },
  ];

  const [existingPortfolio] = await db
    .select({ id: influencerPortfolios.id })
    .from(influencerPortfolios)
    .where(eq(influencerPortfolios.influencerId, profile.id))
    .limit(1);

  if (!existingPortfolio) {
    for (const item of portfolioItems) {
      await db.insert(influencerPortfolios).values({
        influencerId: profile.id,
        ...item,
      });
    }
    console.log(`  ✅ Created ${portfolioItems.length} portfolio items`);
  } else {
    console.log('  ⏭️  Portfolio already exists — skipping');
  }

  // ── 4. Ensure at least one campaign invitation exists ─────────────────────
  const [existingCI] = await db
    .select({ id: campaignInfluencers.id })
    .from(campaignInfluencers)
    .where(eq(campaignInfluencers.influencerId, profile.id))
    .limit(1);

  if (!existingCI) {
    // Find any active campaign to attach to
    const [activeCampaign] = await db
      .select({ id: campaigns.id, budgetTierPricing: campaigns.budgetTierPricing })
      .from(campaigns)
      .where(eq(campaigns.status, 'active'))
      .limit(1);

    if (activeCampaign) {
      const tierPricing = (activeCampaign.budgetTierPricing ?? []) as Array<{ tier: string; rate: number }>;
      const tierEntry = tierPricing.find((t) => t.tier === 'micro');
      const tierRate = tierEntry ? tierEntry.rate.toString() : '8000';

      await db.insert(campaignInfluencers).values({
        campaignId: activeCampaign.id,
        influencerId: profile.id,
        origin: 'brand_invite',
        status: 'invited',
        tierRate,
      });
      console.log('  ✅ Created campaign invitation (status: invited)');
    } else {
      console.log('  ⚠️  No active campaigns found — skipping campaign invitation');
    }
  } else {
    console.log('  ⏭️  Campaign connection already exists — skipping');
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n✅ Review account ready!\n');
  console.log('┌──────────────────────────────────────────────┐');
  console.log(`│  Phone:  ${PHONE.padEnd(36)}│`);
  console.log(`│  OTP:    ${OTP.padEnd(36)}│`);
  console.log(`│  Name:   Ananya Verma                        │`);
  console.log(`│  Tier:   micro (52K followers)                │`);
  console.log('└──────────────────────────────────────────────┘');
  console.log('\nUse these credentials for Apple App Review / Google Play Review.\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Failed to seed review account:', err);
  process.exit(1);
});
