import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { facebookPagesTable } from "./facebook_pages";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id").notNull().references(() => facebookPagesTable.id, { onDelete: "cascade" }),
  title: text("title"),
  postType: text("post_type").$type<"text" | "image" | "video">().default("image"),
  caption: text("caption").notNull(),
  imageUrl: text("image_url"),
  mediaPrompt: text("media_prompt"),
  audioUrl: text("audio_url"),
  status: text("status").$type<"draft" | "scheduled" | "published" | "failed">().default("draft").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  facebookPostId: text("facebook_post_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Post = typeof postsTable.$inferSelect;
export type InsertPost = typeof postsTable.$inferInsert;
