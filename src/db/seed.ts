/**
 * Seed script — populates the database with realistic demo data.
 *
 * Usage:
 *   pnpm db:seed
 *
 * NOTE: When you share src/mocks/data.ts from the frontend,
 * replace the hardcoded arrays below with imports from that file
 * and map the fields to match the DB schema.
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
} from './schema';
import { logger } from '@/shared/utils/logger';

async function seed() {
  logger.info('Starting seed...');

  // ─── Clean existing data (order matters — FK constraints) ──────────────────
  await db.delete(negotiations);
  await db.delete(campaignInfluencers);
  await db.delete(campaigns);
  await db.delete(influencerProfiles);
  await db.delete(brandProfiles);
  await db.delete(users);

  logger.info('Cleared existing data');

  // ─── Brand owner ───────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('password123', 12);

  const [brandUser] = await db
    .insert(users)
    .values({
      email: 'brand@demo.com',
      passwordHash,
      name: 'Aria Sharma',
      role: 'brand_owner',
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
    })
    .returning();

  logger.info(`Created brand: ${brand.brandName}`);

  // ─── Admin ────────────────────────────────────────────────────────────────
  await db.insert(users).values({
    email: 'admin@demo.com',
    passwordHash,
    name: 'Platform Admin',
    role: 'admin',
  });

  // ─── Influencers ──────────────────────────────────────────────────────────
  const influencerData = [
    {
      email: 'priya@demo.com',
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
      email: 'sneha@demo.com',
      name: 'Sneha Patel',
      handle: '@snehafitness',
      tier: 'nano' as const,
      followerCount: 8500,
      engagementRate: '7.80',
      niches: ['Fitness', 'Wellness'],
      location: 'Bangalore, India',
      bio: 'Certified PT | Real fitness for real people.',
      platforms: [{ platform: 'instagram', handle: '@snehafitness', followers: 8500 }],
      rateCard: { instagram_reel: 3000, instagram_post: 2000 },
    },
  ];

  const createdInfluencers = [];
  for (const inf of influencerData) {
    const [u] = await db
      .insert(users)
      .values({ email: inf.email, passwordHash, name: inf.name, role: 'influencer' })
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
      })
      .returning();

    createdInfluencers.push(profile);
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

  const [campaign2] = await db
    .insert(campaigns)
    .values({
      brandId: brand.id,
      name: 'Brand Story — UGC Pack',
      type: 'ugc',
      visibility: 'private',
      status: 'draft',
      objective: 'Content Creation',
      budgetMode: 'paid_product',
      budgetTierPricing: [{ tier: 'nano', rate: 2000 }, { tier: 'micro', rate: 5000 }],
      budgetTotal: '50000',
      niches: ['Beauty', 'Lifestyle'],
      creatorSizes: ['nano', 'micro'],
      brief: 'Create UGC content for our brand story — unboxing and first impressions.',
      deliverables: [{ type: 'instagram_reel', count: 2 }],
    })
    .returning();

  logger.info(`Created ${2} campaigns`);

  // ─── Applications ─────────────────────────────────────────────────────────
  // Priya applied to Summer Glow
  const [ci1] = await db
    .insert(campaignInfluencers)
    .values({
      campaignId: campaign1.id,
      influencerId: createdInfluencers[0].id,
      origin: 'influencer_application',
      status: 'applied',
      tierRate: '8000',
      applicationNote: 'I love clean beauty! Would be thrilled to collaborate.',
      appliedAt: new Date(),
    })
    .returning();

  // Rohan was invited to Summer Glow and is negotiating
  const [ci2] = await db
    .insert(campaignInfluencers)
    .values({
      campaignId: campaign1.id,
      influencerId: createdInfluencers[1].id,
      origin: 'brand_invite',
      status: 'negotiating',
      tierRate: '22000',
    })
    .returning();

  // Negotiation history for Rohan
  await db.insert(negotiations).values([
    {
      campaignInfluencerId: ci2.id,
      party: 'brand',
      amount: '20000',
      note: 'Looking forward to working with you!',
    },
    {
      campaignInfluencerId: ci2.id,
      party: 'influencer',
      amount: '22000',
      note: 'I typically charge 22k for reels of this scope.',
    },
  ]);

  logger.info('Created applications and negotiation history');
  logger.info('\n✅ Seed complete!\n');
  logger.info('Demo accounts:');
  logger.info('  brand@demo.com     / password123  (brand_owner)');
  logger.info('  admin@demo.com     / password123  (admin)');
  logger.info('  priya@demo.com     / password123  (influencer, micro)');
  logger.info('  rohan@demo.com     / password123  (influencer, mid)');
  logger.info('  sneha@demo.com     / password123  (influencer, nano)');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
