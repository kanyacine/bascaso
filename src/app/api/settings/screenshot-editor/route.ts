import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-helpers";
import { getGoogleFontsEnabled, setGoogleFontsEnabled } from "@/lib/screenshot-editor-preferences";

export async function GET() {
  return NextResponse.json({ googleFonts: getGoogleFontsEnabled() });
}

const updateSchema = z.object({ googleFonts: z.boolean() });

export async function PUT(request: Request) {
  const parsed = await parseBody(request, updateSchema);
  if (parsed instanceof Response) return parsed;
  setGoogleFontsEnabled(parsed.googleFonts);
  return NextResponse.json({ googleFonts: getGoogleFontsEnabled() });
}
