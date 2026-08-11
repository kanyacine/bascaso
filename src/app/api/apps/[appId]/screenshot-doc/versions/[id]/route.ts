import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteVersionSnapshot, duplicateVersionSnapshot, getVersionSnapshot, restoreVersionSnapshot,
} from "@/lib/screenshot-docs";
import { parseBody, errorJson } from "@/lib/api-helpers";

const postSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("restore") }),
  z.object({ op: z.literal("duplicate"), name: z.string().trim().min(1).max(120) }),
]);

type RouteParams = { params: Promise<{ appId: string; id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { appId, id } = await params;
  try {
    const snapshot = getVersionSnapshot(appId, id);
    if (!snapshot) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(snapshot);
  } catch (err) {
    return errorJson(err);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { appId, id } = await params;
  const parsed = await parseBody(request, postSchema);
  if (parsed instanceof Response) return parsed;
  try {
    if (parsed.op === "restore") {
      const restored = restoreVersionSnapshot(appId, id);
      if (!restored) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(restored);
    }
    const copy = duplicateVersionSnapshot(appId, id, parsed.name);
    if (!copy) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(copy, { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { appId, id } = await params;
  try {
    if (!deleteVersionSnapshot(appId, id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorJson(err);
  }
}
