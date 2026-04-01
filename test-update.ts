import { db } from './src/db';
import { updateCampaign } from './src/modules/campaigns/campaigns.service';
import { campaigns } from './src/db/schema';

async function test() {
    try {
        const campaignList = await db.select().from(campaigns).limit(1);
        if (campaignList.length === 0) {
            console.log('No campaigns found');
            process.exit(0);
        }
        const campaign = campaignList[0];
        console.log('Testing update on campaign:', campaign.id);

        const dto: any = {
            basics: {
                campaignName: 'Test Name',
                coverImageUrl: '', // Wait, let's test this!
                type: 'influencer',
                niche: 'fashion',
                visibility: 'public',
                objective: 'test',
                location: 'test',
            },
            deliverables: {
                industry: 'fashion',
                platform: 'instagram',
                contentTypes: ['reel'],
                postingType: 'creator',
                brandGuidelines: 'test',
                references: [],
                scriptType: 'creator',
            },
            budget: {
                budgetMode: 'paid',
                totalBudget: 10000,
                mixMode: false,
                selectedTier: 'micro',
                creatorSizes: [],
                tierConfig: [],
                platformFeePercent: 10,
                applicationDeadline: '2026-03-30',
                workDeadline: '2026-04-01',
                scriptDeadline: '2026-03-31',
            },
            meta: {
                status: 'draft',
            }
        };

        const result = await updateCampaign(
            campaign.id,
            { userId: campaign.brandId, role: 'brand_owner', brandId: campaign.brandId } as any,
            dto
        );
        console.log('Success:', result.id);
    } catch (err: any) {
        console.error('ERROR THROWN:');
        console.error(err);
        if (err.stack) console.error(err.stack);
    }
    process.exit(0);
}

test();
