import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const UPLOADS_DIR = join(process.cwd(), "uploads");

/**
 * Generates an image from a text prompt, saves it to disk, and returns
 * a local /api/uploads/<filename> URL that Facebook can access.
 *
 * Tries HuggingFace SDXL first (if API key is set), falls back to Pollinations.
 */
export async function generateAndSaveImage(prompt: string, style?: string | null): Promise<string> {
  const fullPrompt = style ? `${prompt}, ${style} style` : prompt;

  await mkdir(UPLOADS_DIR, { recursive: true });

  // Try HuggingFace first if API key is present
  if (process.env.HUGGING_FACE_API_KEY) {
    try {
      const hfRes = await fetch(
        "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
          },
          body: JSON.stringify({
            inputs: fullPrompt,
            parameters: { num_inference_steps: 20, guidance_scale: 7.5 },
          }),
          signal: AbortSignal.timeout(45_000),
        }
      );
      if (hfRes.ok) {
        const contentType = hfRes.headers.get("content-type") ?? "";
        if (contentType.startsWith("image/")) {
          const buffer = await hfRes.arrayBuffer();
          const ext = contentType.includes("png") ? "png" : "jpg";
          const filename = `${randomUUID()}.${ext}`;
          await writeFile(join(UPLOADS_DIR, filename), Buffer.from(buffer));
          return `/api/uploads/${filename}`;
        }
      }
    } catch {
      // fall through to Pollinations
    }
  }

  // Pollinations fallback — download and save so we get a permanent local URL
  const encodedPrompt = encodeURIComponent(fullPrompt.slice(0, 200));
  const seed = Date.now();
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${seed}`;

  const pollRes = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(90_000) });
  if (!pollRes.ok) throw new Error(`Image generation failed (Pollinations returned ${pollRes.status})`);

  const buffer = await pollRes.arrayBuffer();
  const filename = `${randomUUID()}.jpg`;
  await writeFile(join(UPLOADS_DIR, filename), Buffer.from(buffer));
  return `/api/uploads/${filename}`;
}
