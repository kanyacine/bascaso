import { NextResponse } from "next/server";
import { z } from "zod";
import { saveVersionSnapshot } from "@/lib/screenshot-docs";
import { parseBody, errorJson } from "@/lib/api-helpers";

const postSchema = z.object({ name: z.string().trim().min(1).max(120) });

type RouteParams = { params: Promise<{ appId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { appId } = await params;
  const parsed = await parseBody(request, postSchema);
  if (parsed instanceof Response) return parsed;
  try {
    return NextResponse.json(saveVersionSnapshot(appId, parsed.name), { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}
