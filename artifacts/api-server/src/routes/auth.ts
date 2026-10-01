import { Router } from "express";
import { db, facebookPagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const APP_ID = process.env.FACEBOOK_APP_ID!;
const APP_SECRET = process.env.FACEBOOK_APP_SECRET!;

const SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
].join(",");

/**
 * Build the OAuth callback URL.
 * Priority: APP_URL env var (for Docker/production) → Host header (fallback).
 */
function getCallbackUrl(req: import("express").Request, suffix = ""): string {
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    return `${appUrl.replace(/\/$/, "")}/api/auth/facebook/callback${suffix}`;
  }
  const host = req.get("host") ?? "localhost";
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}/api/auth/facebook/callback${suffix}`;
}

function htmlResult(success: boolean, message: string, connectedCount = 0, debug?: object): string {
  const payload = success
    ? JSON.stringify({ type: "fb-oauth-success", connected: connectedCount })
    : JSON.stringify({ type: "fb-oauth-error", error: message, debug });

  return `<!DOCTYPE html>
<html>
<head><title>Connecting...</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f1117">
  <div style="text-align:center;color:#fff">
    <p style="font-size:1.1rem">${success ? "Connected! Closing window…" : `Error: ${message}`}</p>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage(${payload}, '*');
      }
    } catch(e) {}
    setTimeout(() => window.close(), 800);
  </script>
</body>
</html>`;
}

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

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{ token?: string; error?: string }> {
  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
      new URLSearchParams({ client_id: APP_ID, client_secret: APP_SECRET, redirect_uri: redirectUri, code })
  );
  const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } };
  if (tokenData.error || !tokenData.access_token) return { error: tokenData.error?.message ?? "No token" };

  // Try to exchange for long-lived token
  const llRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: APP_ID,
        client_secret: APP_SECRET,
        fb_exchange_token: tokenData.access_token,
      })
  );
  const llData = await llRes.json() as { access_token?: string };
  return { token: llData.access_token ?? tokenData.access_token };
}

// GET /auth/facebook — redirect to Facebook OAuth
router.get("/auth/facebook", (req, res): void => {
  const redirectUri = getCallbackUrl(req);
  const url = `https://www.facebook.com/v19.0/dialog/oauth?${new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_type: "code",
  })}`;
  res.redirect(url);
});

// GET /auth/facebook/callback — OAuth callback, saves all pages
router.get("/auth/facebook/callback", async (req, res): Promise<void> => {
  const code = req.query["code"] as string | undefined;
  const error = req.query["error"] as string | undefined;

  if (error || !code) {
    res.send(htmlResult(false, error ?? "No code received"));
    return;
  }

  const redirectUri = getCallbackUrl(req);
  const { token, error: tokenError } = await exchangeCodeForToken(code, redirectUri);

  if (tokenError || !token) {
    res.send(htmlResult(false, tokenError ?? "Token exchange failed"));
    return;
  }

  try {
    const { pages: allPages, error: pagesError } = await fetchAllPages(token);
    if (pagesError) {
      res.send(htmlResult(false, pagesError));
      return;
    }

    let connectedCount = 0;
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
          // ignore
        }
      }

      const existing = await db
        .select()
        .from(facebookPagesTable)
        .where(eq(facebookPagesTable.pageId, pageInfo.id));

      if (existing.length > 0) {
        await db
          .update(facebookPagesTable)
          .set({
            accessToken: pageInfo.access_token,
            name: pageInfo.name,
            category: pageInfo.category ?? null,
            avatarUrl,
          })
          .where(eq(facebookPagesTable.pageId, pageInfo.id));
      } else {
        await db.insert(facebookPagesTable).values({
          pageId: pageInfo.id,
          name: pageInfo.name,
          category: pageInfo.category ?? null,
          accessToken: pageInfo.access_token,
          avatarUrl,
        });
        connectedCount++;
      }
    }

    res.send(htmlResult(true, "Connected", connectedCount));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.send(htmlResult(false, msg));
  }
});

export default router;
