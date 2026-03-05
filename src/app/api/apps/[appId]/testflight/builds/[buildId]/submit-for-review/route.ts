import { NextResponse } from "next/server";
import { errorJson } from "@/lib/api-helpers";
import { submitForBetaReview } from "@/lib/asc/testflight";
import { hasCredentials } from "@/lib/asc/client";
import { isDemoMode } from "@/lib/demo";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ appId: string; buildId: string }> },
) {
  const { buildId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ ok: true });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ ok: true });
  }

  try {
    await submitForBetaReview(buildId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
