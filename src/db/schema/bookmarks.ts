import { pgTable, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { brandProfiles } from './brand_profiles';
import { influencerProfiles } from './influencer_profiles';

export const brandInfluencerBookmarks = pgTable(
  'brand_influencer_bookmarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brandProfiles.id, { onDelete: 'cascade' }),
    influencerId: uuid('influencer_id')
      .notNull()
      .references(() => influencerProfiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    brandInfluencerIdx: uniqueIndex('brand_influencer_idx').on(table.brandId, table.influencerId),
  })
);

export type BrandInfluencerBookmark = typeof brandInfluencerBookmarks.$inferSelect;
export type NewBrandInfluencerBookmark = typeof brandInfluencerBookmarks.$inferInsert;
