import { readFile } from "fs/promises";
import path from "path";

type FacebookResult = {
  id?: string;
  error?: { message: string };
};

type FacebookPage = {
  pageId: string;
  accessToken: string;
};

type FacebookPost = {
  postType: string | null;
  caption: string;
  imageUrl: string | null;
  title: string | null;
};

type LocalMedia = {
  filename: string;
  buffer: Buffer;
  contentType: string;
};

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const CONTENT_TYPES: Record<string, string> = {
  ".avi": "video/x-msvideo",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".webp": "image/webp",
};

function getUploadedFilename(mediaUrl: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(mediaUrl, "http://local.invalid").pathname;
  } catch {
    return null;
  }

  const marker = "/api/uploads/";
  const markerIndex = pathname.lastIndexOf(marker);
  if (markerIndex === -1) return null;

  const encodedFilename = pathname.slice(markerIndex + marker.length);
  if (!encodedFilename || encodedFilename.includes("/")) {
    throw new Error("Invalid uploaded media path.");
  }

  let filename: string;
  try {
    filename = decodeURIComponent(encodedFilename);
  } catch {
    throw new Error("Invalid uploaded media path.");
  }

  if (!filename || filename === "." || filename === ".." || path.basename(filename) !== filename) {
    throw new Error("Invalid uploaded media path.");
  }

  return filename;
}

async function loadLocalMedia(mediaUrl: string): Promise<LocalMedia | null> {
  const filename = getUploadedFilename(mediaUrl);
  if (!filename) return null;

  let buffer: Buffer;
  try {
    buffer = await readFile(path.join(UPLOAD_DIR, filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("The uploaded media file is missing from the API server. Re-upload it before publishing.");
    }
    throw error;
  }

  const extension = path.extname(filename).toLowerCase();
  return {
    filename,
    buffer,
    contentType: CONTENT_TYPES[extension] ?? "application/octet-stream",
  };
}

async function postJson(endpoint: string, fields: Record<string, string>): Promise<FacebookResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  return response.json() as Promise<FacebookResult>;
}

async function postMedia(
  endpoint: string,
  fields: Record<string, string>,
  remoteMediaField: "url" | "file_url",
  mediaUrl: string,
): Promise<FacebookResult> {
  const media = await loadLocalMedia(mediaUrl);
  if (!media) {
    return postJson(endpoint, { ...fields, [remoteMediaField]: mediaUrl });
  }

  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }
  form.append("source", new Blob([new Uint8Array(media.buffer)], { type: media.contentType }), media.filename);

  const response = await fetch(endpoint, {
    method: "POST",
    body: form,
  });
  return response.json() as Promise<FacebookResult>;
}

export async function publishToFacebook(
  page: FacebookPage,
  post: FacebookPost,
): Promise<FacebookResult> {
  const postType = post.postType ?? "text";
  const fields: Record<string, string> = { access_token: page.accessToken };

  if (postType === "video" && post.imageUrl) {
    const endpoint = `https://graph.facebook.com/v19.0/${page.pageId}/videos`;
    fields.description = post.caption;
    if (post.title) fields.title = post.title;
    return postMedia(endpoint, fields, "file_url", post.imageUrl);
  }

  if (postType === "image" && post.imageUrl) {
    const endpoint = `https://graph.facebook.com/v19.0/${page.pageId}/photos`;
    fields.caption = post.caption;
    return postMedia(endpoint, fields, "url", post.imageUrl);
  }

  const endpoint = `https://graph.facebook.com/v19.0/${page.pageId}/feed`;
  fields.message = post.caption;
  return postJson(endpoint, fields);
}