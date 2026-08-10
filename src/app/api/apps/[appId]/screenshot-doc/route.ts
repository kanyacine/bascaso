import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateCurrentDoc, saveCurrentDoc } from "@/lib/screenshot-docs";
import { parseBody, errorJson } from "@/lib/api-helpers";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

// The envelope is validated; screenshot internals stay unknown records – their deep shape is
// owned by types.ts and the reducer, and mirroring it here would be 150 lines drifting apart.
const docSchema = z.object({
  screenshots: z.array(z.record(z.string(), z.unknown())),
  selectedIndex: z.number().int().min(0),
  outputDevice: z.string().min(1),
  customWidth: z.number().positive(),
  customHeight: z.number().positive(),
  currentLanguage: z.string().min(1),
  projectLanguages: z.array(z.string().min(1)).min(1),
  defaults: z.record(z.string(), z.unknown()),
});
const putSchema = z.object({ doc: docSchema });

type RouteParams = { params: Promise<{ appId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { appId } = await params;
  try {
    return NextResponse.json(getOrCreateCurrentDoc(appId));
  } catch (err) {
    return errorJson(err);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { appId } = await params;
  const parsed = await parseBody(request, putSchema);
  if (parsed instanceof Response) return parsed;
  try {
    return NextResponse.json(saveCurrentDoc(appId, parsed.doc as unknown as ScreenshotDoc));
  } catch (err) {
    return errorJson(err);
  }
}
