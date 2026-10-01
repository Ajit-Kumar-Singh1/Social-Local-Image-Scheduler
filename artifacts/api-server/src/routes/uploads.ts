import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || "";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|quicktime|mov|avi|mkv)/;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image and video files are allowed"));
    }
  },
});

// POST /uploads — upload a single media file, returns its public URL
router.post("/uploads", upload.single("file"), (req, res): void => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  // Use PUBLIC_URL env var for Docker, fall back to Host header
  const publicBase =
    process.env.PUBLIC_URL ??
    (() => {
      const host = req.get("host") ?? `localhost:${process.env.PORT ?? 5000}`;
      const proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
      return `${proto}://${host}`;
    })();

  const publicUrl = `${publicBase}/api/uploads/${req.file.filename}`;
  req.log.info({ filename: req.file.filename, size: req.file.size }, "File uploaded");
  res.status(201).json({ url: publicUrl, filename: req.file.filename });
});

// GET /uploads/:filename — serve uploaded files
router.get("/uploads/:filename", (req, res): void => {
  const filename = path.basename(req.params.filename as string);
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.sendFile(filePath);
});

export default router;
