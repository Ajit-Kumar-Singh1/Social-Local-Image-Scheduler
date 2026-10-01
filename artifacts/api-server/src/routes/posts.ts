import { Router } from "express";
import { db, postsTable, facebookPagesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import {
  CreatePostBody,
  UpdatePostBody,
  UpdatePostParams,
  DeletePostParams,
  GetPostParams,
  PublishPostParams,
  ListPostsQueryParams,
} from "@workspace/api-zod";
import { cleanupUploadedFile } from "../lib/cleanupUpload";

const router = Router();

const postSelect = {
  id: postsTable.id,
  pageId: postsTable.pageId,
  pageName: facebookPagesTable.name,
  title: postsTable.title,
  postType: postsTable.postType,
  caption: postsTable.caption,
  imageUrl: postsTable.imageUrl,
  audioUrl: postsTable.audioUrl,
  status: postsTable.status,
  scheduledAt: postsTable.scheduledAt,
  publishedAt: postsTable.publishedAt,
  facebookPostId: postsTable.facebookPostId,
  errorMessage: postsTable.errorMessage,
  createdAt: postsTable.createdAt,
};

router.get("/posts", async (req, res): Promise<void> => {
  const parsed = ListPostsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, pageId } = parsed.data;

  const conditions = [];
  if (status) conditions.push(eq(postsTable.status, status));
  if (pageId) conditions.push(eq(postsTable.pageId, pageId));

  const posts = await db
    .select(postSelect)
    .from(postsTable)
    .leftJoin(facebookPagesTable, eq(postsTable.pageId, facebookPagesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(postsTable.createdAt));

  res.json(posts);
});

router.post("/posts", async (req, res): Promise<void> => {
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { pageId, title, postType, caption, imageUrl, mediaPrompt, audioUrl, scheduledAt } = parsed.data;
  const status = scheduledAt ? "scheduled" : "draft";

  const [post] = await db
    .insert(postsTable)
    .values({
      pageId,
      title: title ?? null,
      postType: postType ?? "image",
      caption,
      imageUrl: imageUrl ?? null,
      mediaPrompt: mediaPrompt ?? null,
      audioUrl: audioUrl ?? null,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    })
    .returning();

  const [enriched] = await db
    .select(postSelect)
    .from(postsTable)
    .leftJoin(facebookPagesTable, eq(postsTable.pageId, facebookPagesTable.id))
    .where(eq(postsTable.id, post.id));

  res.status(201).json(enriched);
});

// Bulk create posts
const BulkCreateSchema = z.object({
  posts: z.array(
    z.object({
      pageId: z.number().int(),
      title: z.string().optional().nullable(),
      postType: z.enum(["text", "image", "video"]).optional(),
      caption: z.string().min(1),
      imageUrl: z.string().optional().nullable(),
      mediaPrompt: z.string().optional().nullable(),
      audioUrl: z.string().optional().nullable(),
      scheduledAt: z.string().optional().nullable(),
    })
  ).min(1),
});

router.post("/posts/bulk", async (req, res): Promise<void> => {
  const parsed = BulkCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const created = [];
  for (const p of parsed.data.posts) {
    const status = p.scheduledAt ? "scheduled" : "draft";
    const [post] = await db
      .insert(postsTable)
      .values({
        pageId: p.pageId,
        title: p.title ?? null,
        postType: p.postType ?? "image",
        caption: p.caption,
        imageUrl: p.imageUrl ?? null,
        mediaPrompt: p.mediaPrompt ?? null,
        audioUrl: p.audioUrl ?? null,
        status,
        scheduledAt: p.scheduledAt ? new Date(p.scheduledAt) : null,
      })
      .returning();
    created.push(post);
  }

  res.status(201).json(created);
});

// DELETE /posts/bulk — bulk delete by IDs
router.delete("/posts/bulk", async (req, res): Promise<void> => {
  const body = req.body as { ids?: unknown };
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "number")) {
    res.status(400).json({ error: "ids must be a non-empty array of numbers" });
    return;
  }
  let deleted = 0;
  for (const id of ids as number[]) {
    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, id));
    if (post) {
      cleanupUploadedFile(post.imageUrl);
      await db.delete(postsTable).where(eq(postsTable.id, id));
      deleted++;
    }
  }
  res.json({ deleted });
});

router.get("/posts/:id", async (req, res): Promise<void> => {
  const parsed = GetPostParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [post] = await db
    .select(postSelect)
    .from(postsTable)
    .leftJoin(facebookPagesTable, eq(postsTable.pageId, facebookPagesTable.id))
    .where(eq(postsTable.id, parsed.data.id));

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  res.json(post);
});

router.patch("/posts/:id", async (req, res): Promise<void> => {
  const paramsParsed = UpdatePostParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: paramsParsed.error.message });
    return;
  }

  const bodyParsed = UpdatePostBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const { title, caption, imageUrl, audioUrl, scheduledAt, status } = bodyParsed.data;

  const [updated] = await db
    .update(postsTable)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(caption !== undefined ? { caption } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(audioUrl !== undefined ? { audioUrl } : {}),
      ...(scheduledAt !== undefined ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null } : {}),
      ...(status !== undefined ? { status } : {}),
    })
    .where(eq(postsTable.id, paramsParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const [enriched] = await db
    .select(postSelect)
    .from(postsTable)
    .leftJoin(facebookPagesTable, eq(postsTable.pageId, facebookPagesTable.id))
    .where(eq(postsTable.id, updated.id));

  res.json(enriched);
});

router.delete("/posts/:id", async (req, res): Promise<void> => {
  const parsed = DeletePostParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, parsed.data.id));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  cleanupUploadedFile(post.imageUrl);

  await db.delete(postsTable).where(eq(postsTable.id, parsed.data.id));
  res.status(204).send();
});

// POST /posts/:id/publish — immediate publish
router.post("/posts/:id/publish", async (req, res): Promise<void> => {
  const parsed = PublishPostParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, parsed.data.id));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const [page] = await db.select().from(facebookPagesTable).where(eq(facebookPagesTable.id, post.pageId));
  if (!page) {
    res.status(400).json({ error: "Facebook page not found" });
    return;
  }

  const postType = post.postType ?? "text";
  const body: Record<string, string> = { access_token: page.accessToken };
  let endpoint: string;

  if (postType === "video" && post.imageUrl) {
    endpoint = `https://graph.facebook.com/v19.0/${page.pageId}/videos`;
    body.file_url = post.imageUrl;
    body.description = post.caption;
    if (post.title) body.title = post.title;
  } else if (postType === "image" && post.imageUrl) {
    endpoint = `https://graph.facebook.com/v19.0/${page.pageId}/photos`;
    body.url = post.imageUrl;
    body.caption = post.caption;
  } else {
    endpoint = `https://graph.facebook.com/v19.0/${page.pageId}/feed`;
    body.message = post.caption;
  }

  try {
    const fbRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const fbData = await fbRes.json() as { id?: string; error?: { message: string } };

    if (fbData.error) {
      await db
        .update(postsTable)
        .set({ status: "failed", errorMessage: fbData.error.message })
        .where(eq(postsTable.id, post.id));
      res.status(400).json({ error: fbData.error.message });
      return;
    }

    await db
      .update(postsTable)
      .set({
        status: "published",
        publishedAt: new Date(),
        facebookPostId: fbData.id ?? null,
        errorMessage: null,
      })
      .where(eq(postsTable.id, post.id));

    cleanupUploadedFile(post.imageUrl);

    const [enriched] = await db
      .select(postSelect)
      .from(postsTable)
      .leftJoin(facebookPagesTable, eq(postsTable.pageId, facebookPagesTable.id))
      .where(eq(postsTable.id, post.id));

    res.json(enriched);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(postsTable)
      .set({ status: "failed", errorMessage: msg })
      .where(eq(postsTable.id, post.id));
    res.status(500).json({ error: msg });
  }
});

export default router;
