import { NextResponse } from "next/server";
import { getNomination } from "@/lib/asc/nominations";
import { hasCredentials } from "@/lib/asc/client";
import { errorJson } from "@/lib/api-helpers";
import { isDemoMode } from "@/lib/demo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ nominationId: string }> },
) {
  const { nominationId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ error: "Not available in demo mode" }, { status: 400 });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No ASC credentials" }, { status: 400 });
  }

  try {
    const nomination = await getNomination(nominationId);
    return NextResponse.json({ nomination });
  } catch (err) {
    return errorJson(err);
  }
}
