import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { scriptVersions, campaignInfluencers, campaigns } from '@/db/schema';
import { NotFoundError, ForbiddenError, BadRequestError } from '@/shared/errors';
import type { JWTPayload } from '@/shared/types/api';
import { getFileUrl } from '@/config/storage';

export async function listScriptsForCampaign(campaignId: string, brandUser: JWTPayload) {
  await assertBrandOwnsCampaign(campaignId, brandUser);

  const rows = await db
    .select()
    .from(scriptVersions)
    .innerJoin(campaignInfluencers, eq(campaignInfluencers.id, scriptVersions.campaignInfluencerId))
    .where(eq(campaignInfluencers.campaignId, campaignId));

  return rows.map((r) => ({ ...r.script_versions, ci: r.campaign_influencers }));
}

export async function submitScript(
  campaignId: string,
  influencerUser: JWTPayload,
  filename: string,
  originalName: string
) {
  if (!influencerUser.influencerId) throw new ForbiddenError('Influencer profile not found');

  const [ci] = await db
    .select()
    .from(campaignInfluencers)
    .where(
      and(
        eq(campaignInfluencers.campaignId, campaignId),
        eq(campaignInfluencers.influencerId, influencerUser.influencerId)
      )
    )
    .limit(1);

  if (!ci) throw new NotFoundError('You are not part of this campaign');
  if (!['script_pending', 'accepted', 'paid'].includes(ci.status)) {
    throw new BadRequestError(`Cannot submit script when status is '${ci.status}'`);
  }

  // Get next version number
  const existing = await db
    .select({ versionNumber: scriptVersions.versionNumber })
    .from(scriptVersions)
    .where(eq(scriptVersions.campaignInfluencerId, ci.id))
    .orderBy(scriptVersions.versionNumber);

  const nextVersion = existing.length > 0 ? Math.max(...existing.map((e) => e.versionNumber)) + 1 : 1;

  const fileUrl = getFileUrl('scripts', filename);

  const [script] = await db
    .insert(scriptVersions)
    .values({
      campaignInfluencerId: ci.id,
      versionNumber: nextVersion,
      fileUrl,
      fileName: originalName,
      status: 'pending',
    })
    .returning();

  // Update ci status
  await db
    .update(campaignInfluencers)
    .set({ status: 'script_review', updatedAt: new Date() })
    .where(eq(campaignInfluencers.id, ci.id));

  return script;
}

export async function approveScript(scriptId: string, brandUser: JWTPayload) {
  const [script] = await db.select().from(scriptVersions).where(eq(scriptVersions.id, scriptId)).limit(1);
  if (!script) throw new NotFoundError('Script');

  const [ci] = await db.select().from(campaignInfluencers).where(eq(campaignInfluencers.id, script.campaignInfluencerId)).limit(1);
  if (!ci) throw new NotFoundError('Campaign influencer');

  await assertBrandOwnsCampaign(ci.campaignId, brandUser);

  const [updated] = await db
    .update(scriptVersions)
    .set({ status: 'approved', reviewedAt: new Date(), reviewedBy: brandUser.sub })
    .where(eq(scriptVersions.id, scriptId))
    .returning();

  // Advance CI to work_pending
  await db
    .update(campaignInfluencers)
    .set({ status: 'work_pending', updatedAt: new Date() })
    .where(eq(campaignInfluencers.id, ci.id));

  return updated;
}

export async function requestScriptRevision(scriptId: string, reviewNote: string, brandUser: JWTPayload) {
  const [script] = await db.select().from(scriptVersions).where(eq(scriptVersions.id, scriptId)).limit(1);
  if (!script) throw new NotFoundError('Script');

  const [ci] = await db.select().from(campaignInfluencers).where(eq(campaignInfluencers.id, script.campaignInfluencerId)).limit(1);
  if (!ci) throw new NotFoundError('Campaign influencer');

  await assertBrandOwnsCampaign(ci.campaignId, brandUser);

  const [updated] = await db
    .update(scriptVersions)
    .set({ status: 'revision_requested', reviewNote, reviewedAt: new Date(), reviewedBy: brandUser.sub })
    .where(eq(scriptVersions.id, scriptId))
    .returning();

  // Reset CI to script_pending for resubmission
  await db
    .update(campaignInfluencers)
    .set({ status: 'script_pending', updatedAt: new Date() })
    .where(eq(campaignInfluencers.id, ci.id));

  return updated;
}

async function assertBrandOwnsCampaign(campaignId: string, user: JWTPayload) {
  if (user.role === 'admin') return;
  const [campaign] = await db.select({ brandId: campaigns.brandId }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign) throw new NotFoundError('Campaign');
  if (campaign.brandId !== user.brandId) throw new ForbiddenError('You do not own this campaign');
}
