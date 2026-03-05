import { NextResponse } from "next/server";
import { z } from "zod";
import { errorJson } from "@/lib/api-helpers";
import { addBuildToGroups, removeBuildFromGroups } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";
import { isDemoMode } from "@/lib/demo";

const schema = z.object({
  groupIds: z.array(z.string().min(1)).min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string; buildId: string }> },
) {
  const { buildId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ ok: true });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await addBuildToGroups(buildId, parsed.data.groupIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ appId: string; buildId: string }> },
) {
  const { buildId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ ok: true });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await removeBuildFromGroups(buildId, parsed.data.groupIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
