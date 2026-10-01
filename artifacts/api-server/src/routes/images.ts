import { Router } from "express";
import { GenerateImageBody } from "@workspace/api-zod";
import { generateAndSaveImage } from "../lib/generateImage.js";

const router = Router();

router.post("/images/generate", async (req, res): Promise<void> => {
  const parsed = GenerateImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { prompt, style } = parsed.data;

  try {
    const imageUrl = await generateAndSaveImage(prompt, style);
    req.log.info({ imageUrl }, "AI image generated and saved");
    res.json({ imageUrl, prompt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Image generation failed";
    req.log.error({ err }, "AI image generation failed");
    res.status(502).json({ error: msg });
  }
});

export default router;
