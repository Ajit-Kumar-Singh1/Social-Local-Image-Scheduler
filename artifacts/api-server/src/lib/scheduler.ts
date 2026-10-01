import { db, postsTable, facebookPagesTable } from "@workspace/db";
import { eq, lte, and } from "drizzle-orm";
import { logger } from "./logger";
import { cleanupUploadedFile } from "./cleanupUpload";
import { generateAndSaveImage } from "./generateImage";

async function publishToFacebook(
  page: { pageId: string; accessToken: string },
  post: { id: number; postType: string | null; caption: string; imageUrl: string | null; title: string | null }
): Promise<{ id?: string; error?: { message: string } }> {
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

  const fbRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return fbRes.json() as Promise<{ id?: string; error?: { message: string } }>;
}

async function publishScheduledPosts() {
  const now = new Date();
  const duePosts = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.status, "scheduled"), lte(postsTable.scheduledAt, now)));

  if (duePosts.length === 0) return;

  logger.info({ count: duePosts.length }, "Publishing scheduled posts");

  for (let post of duePosts) {
    const [page] = await db
      .select()
      .from(facebookPagesTable)
      .where(eq(facebookPagesTable.id, post.pageId));

    if (!page) {
      await db
        .update(postsTable)
        .set({ status: "failed", errorMessage: "Facebook page not found" })
        .where(eq(postsTable.id, post.id));
      continue;
    }

    // If image/video post has no imageUrl yet, try generating from mediaPrompt
    if (post.postType !== "text" && !post.imageUrl) {
      if (post.mediaPrompt) {
        logger.info({ postId: post.id }, "Generating AI image for scheduled post");
        try {
          const imageUrl = await generateAndSaveImage(post.mediaPrompt);
          await db.update(postsTable).set({ imageUrl }).where(eq(postsTable.id, post.id));
          post = { ...post, imageUrl };
          logger.info({ postId: post.id, imageUrl }, "AI image generated and saved for scheduled post");
        } catch (genErr) {
          const msg = genErr instanceof Error ? genErr.message : "AI image generation failed";
          await db
            .update(postsTable)
            .set({ status: "failed", errorMessage: `AI image generation failed: ${msg}` })
            .where(eq(postsTable.id, post.id));
          logger.error({ err: genErr, postId: post.id }, "Failed to generate AI image for scheduled post");
          continue;
        }
      } else {
        await db
          .update(postsTable)
          .set({
            status: "failed",
            errorMessage: "This image/video post has no media and no AI prompt. Please upload an image or set an AI prompt.",
          })
          .where(eq(postsTable.id, post.id));
        logger.warn({ postId: post.id }, "Skipping scheduled post — no imageUrl and no mediaPrompt");
        continue;
      }
    }

    try {
      const fbData = await publishToFacebook(page, post);

      if (fbData.error) {
        await db
          .update(postsTable)
          .set({ status: "failed", errorMessage: fbData.error.message })
          .where(eq(postsTable.id, post.id));
        logger.warn({ postId: post.id, error: fbData.error.message }, "Failed to publish scheduled post");
      } else {
        await db
          .update(postsTable)
          .set({
            status: "published",
            publishedAt: new Date(),
            facebookPostId: fbData.id ?? null,
            errorMessage: null,
          })
          .where(eq(postsTable.id, post.id));
        logger.info({ postId: post.id, facebookPostId: fbData.id }, "Scheduled post published");
        cleanupUploadedFile(post.imageUrl);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await db
        .update(postsTable)
        .set({ status: "failed", errorMessage: msg })
        .where(eq(postsTable.id, post.id));
      logger.error({ err, postId: post.id }, "Error publishing scheduled post");
    }
  }
}

export function startScheduler() {
  logger.info("Post scheduler started — checking every 60 seconds");
  void publishScheduledPosts();
  setInterval(() => void publishScheduledPosts(), 60_000);
}
