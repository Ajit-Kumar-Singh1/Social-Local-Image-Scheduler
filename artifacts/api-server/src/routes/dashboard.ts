import { Router } from "express";
import { db, postsTable, facebookPagesTable } from "@workspace/db";
import { eq, count, desc } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const [pagesCount] = await db.select({ count: count() }).from(facebookPagesTable);
  const [postsCount] = await db.select({ count: count() }).from(postsTable);
  const [scheduledCount] = await db
    .select({ count: count() })
    .from(postsTable)
    .where(eq(postsTable.status, "scheduled"));
  const [publishedCount] = await db
    .select({ count: count() })
    .from(postsTable)
    .where(eq(postsTable.status, "published"));
  const [draftCount] = await db
    .select({ count: count() })
    .from(postsTable)
    .where(eq(postsTable.status, "draft"));
  const [failedCount] = await db
    .select({ count: count() })
    .from(postsTable)
    .where(eq(postsTable.status, "failed"));

  res.json({
    totalPages: Number(pagesCount.count),
    totalPosts: Number(postsCount.count),
    scheduledPosts: Number(scheduledCount.count),
    publishedPosts: Number(publishedCount.count),
    draftPosts: Number(draftCount.count),
    failedPosts: Number(failedCount.count),
  });
});

router.get("/dashboard/recent-posts", async (req, res): Promise<void> => {
  const posts = await db
    .select({
      id: postsTable.id,
      pageId: postsTable.pageId,
      pageName: facebookPagesTable.name,
      caption: postsTable.caption,
      imageUrl: postsTable.imageUrl,
      audioUrl: postsTable.audioUrl,
      status: postsTable.status,
      scheduledAt: postsTable.scheduledAt,
      publishedAt: postsTable.publishedAt,
      facebookPostId: postsTable.facebookPostId,
      errorMessage: postsTable.errorMessage,
      createdAt: postsTable.createdAt,
    })
    .from(postsTable)
    .leftJoin(facebookPagesTable, eq(postsTable.pageId, facebookPagesTable.id))
    .orderBy(desc(postsTable.createdAt))
    .limit(5);

  res.json(posts);
});

router.get("/dashboard/upcoming", async (req, res): Promise<void> => {
  const posts = await db
    .select({
      id: postsTable.id,
      pageId: postsTable.pageId,
      pageName: facebookPagesTable.name,
      caption: postsTable.caption,
      imageUrl: postsTable.imageUrl,
      audioUrl: postsTable.audioUrl,
      status: postsTable.status,
      scheduledAt: postsTable.scheduledAt,
      publishedAt: postsTable.publishedAt,
      facebookPostId: postsTable.facebookPostId,
      errorMessage: postsTable.errorMessage,
      createdAt: postsTable.createdAt,
    })
    .from(postsTable)
    .leftJoin(facebookPagesTable, eq(postsTable.pageId, facebookPagesTable.id))
    .where(eq(postsTable.status, "scheduled"))
    .orderBy(postsTable.scheduledAt)
    .limit(10);

  res.json(posts);
});

export default router;
