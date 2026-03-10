import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import {
  cancelSubmission,
  cancelUnresolvedSubmission,
  invalidateVersionsCache,
} from "@/lib/asc/version-mutations";
import { errorJson } from "@/lib/api-helpers";
import { isDemoMode } from "@/lib/demo";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string; versionId: string }> },
) {
  const { appId, versionId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ ok: true });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    if (body.unresolved) {
      await cancelUnresolvedSubmission(appId);
    } else {
      await cancelSubmission(versionId);
    }
    invalidateVersionsCache(appId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err, 500);
  }
}
