import { NextResponse } from "next/server";
import { z } from "zod";
import { hasGeminiKey, saveGeminiKey, removeGeminiKey } from "@/lib/ai/gemini-key";
import { getAISettings } from "@/lib/ai/settings";
import { parseBody } from "@/lib/api-helpers";

export async function GET() {
  const available = await hasGeminiKey();
  const settings = await getAISettings();
  const fromMainProvider = settings?.provider === "google";

  return NextResponse.json({ available, fromMainProvider });
}

const saveSchema = z.object({
  apiKey: z.string().trim().min(1),
});

export async function PUT(request: Request) {
  const parsed = await parseBody(request, saveSchema);
  if (parsed instanceof Response) return parsed;

  saveGeminiKey(parsed.apiKey);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  removeGeminiKey();
  return NextResponse.json({ ok: true });
}
