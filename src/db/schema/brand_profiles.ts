import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const brandProfiles = pgTable('brand_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  brandName: varchar('brand_name', { length: 255 }).notNull(),
  brandLogoUrl: varchar('brand_logo_url', { length: 500 }),
  industry: varchar('industry', { length: 100 }),
  website: varchar('website', { length: 255 }),
  description: text('description'),
  verified: boolean('verified').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type BrandProfile = typeof brandProfiles.$inferSelect;
export type NewBrandProfile = typeof brandProfiles.$inferInsert;
