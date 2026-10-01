import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const facebookPagesTable = pgTable("facebook_pages", {
  id: serial("id").primaryKey(),
  pageId: text("page_id").notNull().unique(),
  name: text("name").notNull(),
  category: text("category"),
  accessToken: text("access_token").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type FacebookPage = typeof facebookPagesTable.$inferSelect;
export type InsertFacebookPage = typeof facebookPagesTable.$inferInsert;
