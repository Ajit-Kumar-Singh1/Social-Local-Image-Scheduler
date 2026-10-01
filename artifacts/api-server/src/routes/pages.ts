import { Router } from "express";
import { db, facebookPagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ConnectPageBody, DisconnectPageParams } from "@workspace/api-zod";

const router = Router();

type FbPage = {
  id: string;
  name: string;
  category?: string;
  access_token: string;
  picture?: { data: { url: string } };
};

async function fetchAllPages(userToken: string): Promise<{ pages: FbPage[]; error?: string }> {
  const pages: FbPage[] = [];
  let url: string | null =
    `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,category,access_token,picture&limit=100&access_token=${userToken}`;

  while (url) {
    const res = await fetch(url);
    const data = await res.json() as {
      data?: FbPage[];
      paging?: { next?: string };
      error?: { message: string };
    };

    if (data.error) return { pages, error: data.error.message };
    if (data.data) pages.push(...data.data);
    url = data.paging?.next ?? null;
  }

  return { pages };
}

router.get("/pages", async (req, res): Promise<void> => {
  const pages = await db.select().from(facebookPagesTable).orderBy(facebookPagesTable.createdAt);
  res.json(pages);
});

router.post("/pages", async (req, res): Promise<void> => {
  const parsed = ConnectPageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { accessToken } = parsed.data;

  try {
    const { pages: allPages, error: pagesError } = await fetchAllPages(accessToken);

    if (pagesError) {
      res.status(400).json({ error: pagesError });
      return;
    }

    if (allPages.length === 0) {
      res.status(400).json({
        error:
          "No pages found for this access token. Only Pages where you have an Admin or Editor role are returned.",
      });
      return;
    }

    let connectedCount = 0;
    const connectedPages = [];

    for (const pageInfo of allPages) {
      let avatarUrl: string | null = pageInfo.picture?.data?.url ?? null;
      if (!avatarUrl) {
        try {
          const picRes = await fetch(
            `https://graph.facebook.com/v19.0/${pageInfo.id}/picture?type=square&redirect=false&access_token=${pageInfo.access_token}`
          );
          const picData = await picRes.json() as { data?: { url: string } };
          avatarUrl = picData.data?.url ?? null;
        } catch {
          // ignore avatar errors
        }
      }

      const existing = await db
        .select()
        .from(facebookPagesTable)
        .where(eq(facebookPagesTable.pageId, pageInfo.id));

      if (existing.length > 0) {
        const [updated] = await db
          .update(facebookPagesTable)
          .set({ accessToken: pageInfo.access_token, name: pageInfo.name, avatarUrl })
          .where(eq(facebookPagesTable.pageId, pageInfo.id))
          .returning();
        connectedPages.push(updated);
      } else {
        const [page] = await db
          .insert(facebookPagesTable)
          .values({
            pageId: pageInfo.id,
            name: pageInfo.name,
            category: pageInfo.category ?? null,
            accessToken: pageInfo.access_token,
            avatarUrl,
          })
          .returning();
        connectedPages.push(page);
        connectedCount++;
      }
    }

    res.status(201).json({ connected: connectedCount, pages: connectedPages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

router.delete("/pages/:id", async (req, res): Promise<void> => {
  const parsed = DisconnectPageParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.delete(facebookPagesTable).where(eq(facebookPagesTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
