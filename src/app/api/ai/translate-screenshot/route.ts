import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { getGeminiKey, saveGeminiKey } from "@/lib/ai/gemini-key";
import { parseBody } from "@/lib/api-helpers";
import { localeName } from "@/lib/asc/locale-names";

const SCREENSHOT_MODEL = "gemini-3-pro-image-preview";
const ALLOWED_HOST = "is1-ssl.mzstatic.com";

const requestSchema = z.object({
  /** Apple CDN URL for the screenshot. */
  imageUrl: z.string().url(),
  /** Target locale code (e.g. "ru"). */
  toLocale: z.string(),
  /** Only translate marketing/overlay text, not app UI. */
  marketingOnly: z.boolean().default(true),
  /** Optional: save a new Gemini API key before translating. */
  geminiKey: z.string().optional(),
});

export async function POST(request: Request) {
  console.log("[translate-screenshot] POST received");
  const parsed = await parseBody(request, requestSchema);
  if (parsed instanceof Response) {
    console.log("[translate-screenshot] parseBody failed");
    return parsed;
  }

  const { imageUrl, toLocale, marketingOnly, geminiKey } = parsed;
  console.log("[translate-screenshot] toLocale=%s marketingOnly=%s hasKey=%s imageUrl=%s", toLocale, marketingOnly, !!geminiKey, imageUrl.slice(0, 80));

  // Validate URL is from Apple CDN
  try {
    const url = new URL(imageUrl);
    if (url.hostname !== ALLOWED_HOST) {
      return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  // Save new key if provided
  if (geminiKey) {
    saveGeminiKey(geminiKey);
  }

  const apiKey = geminiKey ?? await getGeminiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "gemini_key_required" },
      { status: 400 },
    );
  }

  // Fetch the image from Apple CDN
  console.log("[translate-screenshot] Fetching image from CDN...");
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    console.log("[translate-screenshot] CDN fetch failed: %d", imgRes.status);
    return NextResponse.json(
      { error: "Failed to fetch screenshot from Apple CDN" },
      { status: 502 },
    );
  }

  const imgBuffer = await imgRes.arrayBuffer();
  const originalBuffer = Buffer.from(imgBuffer);
  const imageBase64 = originalBuffer.toString("base64");
  const mimeType = imgRes.headers.get("content-type") ?? "image/png";

  // Get original dimensions for later resizing
  const originalMeta = await sharp(originalBuffer).metadata();
  const origWidth = originalMeta.width!;
  const origHeight = originalMeta.height!;
  console.log("[translate-screenshot] Image fetched: %d bytes, type=%s, %dx%d", imgBuffer.byteLength, mimeType, origWidth, origHeight);

  const targetLanguage = localeName(toLocale);

  const prompt = marketingOnly
    ? `Translate marketing texts on the App Store Connect screenshot image to ${targetLanguage} preserving fonts and all other details. Do not translate UI of the app, only marketing texts.`
    : `Translate all texts on the App Store Connect screenshot image to ${targetLanguage} preserving fonts and all other details.`;

  console.log("[translate-screenshot] Calling Gemini model=%s prompt length=%d", SCREENSHOT_MODEL, prompt.length);
  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: SCREENSHOT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          imageSize: "4K",
        },
      },
    });

    // Extract generated image from response
    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      return NextResponse.json(
        { error: "No response from Gemini" },
        { status: 502 },
      );
    }

    const parts = candidates[0].content?.parts ?? [];
    console.log("[translate-screenshot] Response parts: %d", parts.length);
    for (const part of parts) {
      if (part.inlineData?.data) {
        console.log("[translate-screenshot] Got image: %d base64 chars", part.inlineData.data.length);

        // Resize to match original dimensions and convert to match source format
        const geminiBuffer = Buffer.from(part.inlineData.data, "base64");
        let pipeline = sharp(geminiBuffer).resize(origWidth, origHeight);
        if (mimeType === "image/jpeg") {
          pipeline = pipeline.jpeg();
        } else {
          pipeline = pipeline.png();
        }
        const resized = await pipeline.toBuffer();

        console.log("[translate-screenshot] Resized to %dx%d %s: %d bytes", origWidth, origHeight, mimeType, resized.length);
        return NextResponse.json({
          imageBase64: resized.toString("base64"),
          mimeType,
        });
      }
    }

    // No image in response – might have gotten text only
    const textParts = parts.filter((p) => p.text).map((p) => p.text).join(" ");
    return NextResponse.json(
      { error: `Gemini did not return an image. Response: ${textParts.slice(0, 200)}` },
      { status: 422 },
    );
  } catch (err) {
    console.error("[translate-screenshot] Error:", err);
    const message = err instanceof Error ? err.message : String(err);
    if (/401|unauthorized|invalid.*key|api.key/i.test(message)) {
      return NextResponse.json({ error: "gemini_auth_error" }, { status: 401 });
    }
    return NextResponse.json(
      { error: `Screenshot translation failed: ${message}` },
      { status: 500 },
    );
  }
}
