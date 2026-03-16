/**
 * Seed script — populates the database with realistic demo data.
 *
 * Usage:
 *   pnpm db:seed
 */

import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { db } from './index';
import {
  users,
  brandProfiles,
  influencerProfiles,
  campaigns,
  campaignInfluencers,
  negotiations,
  scriptVersions,
  workSubmissions,
  payments,
  conversations,
  messages,
} from './schema';
import { logger } from '@/shared/utils/logger';

async function seed() {
  logger.info('Starting seed...');

  // ─── Clean existing data (order matters — FK constraints) ──────────────────
  await db.delete(messages);
  await db.delete(conversations);
  await db.delete(payments);
  await db.delete(workSubmissions);
  await db.delete(scriptVersions);
  await db.delete(negotiations);
  await db.delete(campaignInfluencers);
  await db.delete(campaigns);
  await db.delete(influencerProfiles);
  await db.delete(brandProfiles);
  await db.delete(users);

  logger.info('Cleared existing data');

  const passwordHash = await bcrypt.hash('password123', 12);

  // ─── Brand owner ───────────────────────────────────────────────────────────
  const [brandUser] = await db
    .insert(users)
    .values({
      email: 'brand@demo.com',
      passwordHash,
      name: 'Aria Sharma',
      role: 'brand_owner',
      isVerified: true,
    })
    .returning();

  const [brand] = await db
    .insert(brandProfiles)
    .values({
      userId: brandUser.id,
      brandName: 'Zephyr Beauty',
      industry: 'Beauty & Skincare',
      website: 'https://zephyrbeauty.com',
      description: 'Clean beauty brand focused on sustainable ingredients.',
      verified: true,
    })
    .returning();

  logger.info(`Created brand: ${brand.brandName}`);

  // ─── Admin ────────────────────────────────────────────────────────────────
  await db.insert(users).values({
    email: 'admin@demo.com',
    passwordHash,
    name: 'Platform Admin',
    role: 'admin',
    isVerified: true,
  });

  // ─── Influencers ──────────────────────────────────────────────────────────
  const influencerData = [
    {
      email: 'priya@demo.com',
      phoneNumber: '9100000001',
      name: 'Priya Mehta',
      handle: '@priyamehta',
      tier: 'micro' as const,
      followerCount: 45000,
      engagementRate: '4.20',
      niches: ['Beauty', 'Skincare'],
      location: 'Mumbai, India',
      bio: 'Skincare enthusiast & sustainable beauty advocate.',
      platforms: [{ platform: 'instagram', handle: '@priyamehta', followers: 45000 }],
      rateCard: { instagram_reel: 8000, instagram_post: 5000 },
    },
    {
      email: 'rohan@demo.com',
      phoneNumber: '9100000002',
      name: 'Rohan Kapoor',
      handle: '@rohanlifestyle',
      tier: 'mid' as const,
      followerCount: 120000,
      engagementRate: '3.50',
      niches: ['Lifestyle', 'Fashion'],
      location: 'Delhi, India',
      bio: 'Lifestyle creator | Fashion | Travel.',
      platforms: [{ platform: 'instagram', handle: '@rohanlifestyle', followers: 120000 }],
      rateCard: { instagram_reel: 20000, youtube_video: 50000 },
    },
    {
      email: 'test1@demo.com',
      phoneNumber: '9100000003',
      name: 'Test Influencer 1',
      handle: '@testinfluencer1',
      tier: 'nano' as const,
      followerCount: 5000,
      engagementRate: '8.50',
      niches: ['Tech', 'Lifestyle'],
      location: 'Bangalore, India',
      bio: 'Exploring the intersection of tech and life.',
      platforms: [{ platform: 'instagram', handle: '@testinfluencer1', followers: 5000 }],
      rateCard: { instagram_reel: 2500, instagram_post: 1500 },
    },
    {
      email: 'test2@demo.com',
      phoneNumber: '9100000004',
      name: 'Test Influencer 2',
      handle: '@testinfluencer2',
      tier: 'micro' as const,
      followerCount: 15000,
      engagementRate: '5.20',
      niches: ['Fashion', 'Beauty'],
      location: 'Hyderabad, India',
      bio: 'Style is a way to say who you are.',
      platforms: [{ platform: 'instagram', handle: '@testinfluencer2', followers: 15000 }],
      rateCard: { instagram_reel: 7000, instagram_post: 4000 },
    },
  ];

  const createdInfluencers = [];
  for (const inf of influencerData) {
    const [u] = await db
      .insert(users)
      .values({ 
        email: inf.email, 
        phoneNumber: inf.phoneNumber,
        passwordHash, 
        name: inf.name, 
        role: 'influencer', 
        isVerified: true 
      })
      .returning();

    const [profile] = await db
      .insert(influencerProfiles)
      .values({
        userId: u.id,
        handle: inf.handle,
        bio: inf.bio,
        location: inf.location,
        niches: inf.niches,
        tier: inf.tier,
        followerCount: inf.followerCount,
        engagementRate: inf.engagementRate,
        platforms: inf.platforms,
        rateCard: inf.rateCard as unknown as Record<string, number>,
        isVerified: true,
      })
      .returning();

    createdInfluencers.push({ ...profile, userId: u.id });
    logger.info(`Created influencer: ${inf.name} (${inf.tier})`);
  }

  // ─── Campaigns ────────────────────────────────────────────────────────────
  const [campaign1] = await db
    .insert(campaigns)
    .values({
      brandId: brand.id,
      name: 'Summer Glow Campaign',
      type: 'influencer',
      visibility: 'public',
      status: 'active',
      objective: 'Brand Awareness',
      budgetMode: 'paid',
      budgetTierPricing: [
        { tier: 'nano', rate: 3000 },
        { tier: 'micro', rate: 8000 },
        { tier: 'mid', rate: 20000 },
      ],
      budgetTotal: '150000',
      niches: ['Beauty', 'Skincare'],
      creatorSizes: ['nano', 'micro', 'mid'],
      brief: 'Showcase our new Summer Glow serum in a 30-60 second reel. Natural lighting preferred.',
      dos: ['Show the product application', 'Use natural lighting', 'Mention SPF protection'],
      donts: ['No heavy filters', 'No competitor mentions', 'No fake reviews'],
      hashtags: ['#ZephyrGlow', '#SummerSkin', '#CleanBeauty'],
      deliverables: [{ type: 'instagram_reel', count: 1 }],
      proofOfWorkReq: true,
      launchedAt: new Date(),
    })
    .returning();

  logger.info(`Created campaign: ${campaign1.name}`);

  // ─── OTP test influencer (so app login with OTP sees campaigns) ─────────────
  const testOtpPhone = process.env.TEST_OTP_PHONE || '7032952586';
  const testOtpPhoneNormalized = testOtpPhone.startsWith('+') ? testOtpPhone : `+91${testOtpPhone}`;
  const [otpUser] = await db
    .insert(users)
    .values({
      phoneNumber: testOtpPhoneNormalized,
      email: `${testOtpPhone}@otp-test.mutiny.com`,
      passwordHash: '',
      name: 'OTP Test Creator',
      role: 'influencer',
      isVerified: true,
    })
    .returning();

  const [otpProfile] = await db
    .insert(influencerProfiles)
    .values({
      userId: otpUser.id,
      handle: '@otptest',
      bio: 'Test account for OTP login — see campaigns in app.',
      tier: 'micro',
      followerCount: 25000,
      isVerified: false,
    })
    .returning();

  await db.insert(campaignInfluencers).values({
    campaignId: campaign1.id,
    influencerId: otpProfile.id,
    origin: 'brand_invite',
    status: 'invited',
    tierRate: '8000',
  });
  logger.info(`Created OTP test influencer: ${testOtpPhoneNormalized} with 1 campaign (invited). Sign in with OTP using ${testOtpPhone} to see it.`);

  // ─── Application States ───────────────────────────────────────────────────
  
  // 1. Priya: Applied (New Application)
  await db.insert(campaignInfluencers).values({
    campaignId: campaign1.id,
    influencerId: createdInfluencers[0].id,
    origin: 'influencer_application',
    status: 'applied',
    tierRate: '8000',
    applicationNote: 'I love clean beauty! Would be thrilled to collaborate.',
    appliedAt: new Date(),
  });

  // 2. Rohan: Negotiating
  const [ciRohan] = await db
    .insert(campaignInfluencers)
    .values({
      campaignId: campaign1.id,
      influencerId: createdInfluencers[1].id,
      origin: 'brand_invite',
      status: 'negotiating',
      tierRate: '22000',
    })
    .returning();

  await db.insert(negotiations).values([
    {
      campaignInfluencerId: ciRohan.id,
      party: 'brand',
      amount: '20000',
      note: 'Looking forward to working with you!',
    },
    {
      campaignInfluencerId: ciRohan.id,
      party: 'influencer',
      amount: '22000',
      note: 'I typically charge 22k for reels of this scope.',
    },
  ]);

  // 3. Test Influencer 1: Script Review (Stage: Scripting)
  const [ciTest1] = await db
    .insert(campaignInfluencers)
    .values({
      campaignId: campaign1.id,
      influencerId: createdInfluencers[2].id,
      origin: 'brand_invite',
      status: 'script_review',
      tierRate: '2500',
      agreedBudget: '2500',
      chatEnabled: true,
      acceptedAt: new Date(),
    })
    .returning();

  await db.insert(scriptVersions).values({
    campaignInfluencerId: ciTest1.id,
    versionNumber: 1,
    fileUrl: 'https://example.com/scripts/test1_v1.pdf',
    fileName: 'Summer_Glow_Script_Test1.pdf',
    status: 'pending',
  });

  // 4. Test Influencer 2: Work Review (Stage: Content Creation)
  const [ciTest2] = await db
    .insert(campaignInfluencers)
    .values({
      campaignId: campaign1.id,
      influencerId: createdInfluencers[3].id,
      origin: 'influencer_application',
      status: 'work_review',
      tierRate: '7000',
      agreedBudget: '7000',
      chatEnabled: true,
      acceptedAt: new Date(),
      paidAt: new Date(), // Simulating it was paid
    })
    .returning();

  await db.insert(workSubmissions).values({
    campaignInfluencerId: ciTest2.id,
    type: 'instagram_reel',
    url: 'https://www.instagram.com/reels/test_reel_2/',
    fileName: 'final_reel_v2.mp4',
    proofOfWorkUrl: 'https://example.com/proofs/test2_proof.jpg',
    status: 'pending',
  });

  // ─── Conversations & Messages for Test Influencer 1 ───────────────────────
  const [conv1] = await db
    .insert(conversations)
    .values({
      campaignId: campaign1.id,
      brandId: brand.id,
      influencerId: createdInfluencers[2].id,
      status: 'active',
      lastMessage: 'Hey! I have submitted my script for review.',
      lastMessageAt: new Date(),
      brandUnread: 1,
    })
    .returning();

  await db.insert(messages).values([
    {
      conversationId: conv1.id,
      senderId: brandUser.id,
      senderRole: 'brand',
      content: 'Welcome to the campaign! Excited to see your ideas.',
    },
    {
      conversationId: conv1.id,
      senderId: createdInfluencers[2].userId,
      senderRole: 'influencer',
      content: 'Thanks! I have submitted my script for review.',
    },
  ]);

  logger.info('Created applications, scripts, work submissions, and conversations');
  logger.info('\n✅ Seed complete!\n');
  logger.info('Demo accounts:');
  logger.info('  brand@demo.com     / password123  (brand_owner)');
  logger.info('  admin@demo.com     / password123  (admin)');
  logger.info('  priya@demo.com     / password123  (influencer, micro) - Applied');
  logger.info('  rohan@demo.com     / password123  (influencer, mid)   - Negotiating');
  logger.info('  test1@demo.com     / password123  (influencer, nano)  - Script Review');
  logger.info('  test2@demo.com     / password123  (influencer, micro) - Work Review');
  logger.info(`  OTP ${testOtpPhoneNormalized} (no password)  (influencer) - 1 invited campaign — use in app to see campaigns`);

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
