import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import { findUnresolvedSubmission } from "@/lib/asc/version-mutations";
import { isDemoMode } from "@/lib/demo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ hasUnresolved: false });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  const submissionId = await findUnresolvedSubmission(appId);
  return NextResponse.json({ hasUnresolved: submissionId !== null });
}
