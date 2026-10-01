import path from "path";
import fs from "fs";
import { logger } from "./logger";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

export function cleanupUploadedFile(url: string | null | undefined): void {
  if (!url || !url.includes("/api/uploads/")) return;
  try {
    const parts = url.split("/api/uploads/");
    if (parts.length < 2) return;
    const filename = path.basename(parts[1]);
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info({ filename }, "Deleted uploaded file after publish");
    }
  } catch (err) {
    logger.warn({ err, url }, "Failed to clean up uploaded file — ignoring");
  }
}
