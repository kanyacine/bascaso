import { NextResponse } from "next/server";
import { getAppleFmStatus } from "@/lib/ai/apple-fm";

/** Availability probe for the Apple Foundation Model sidecar, for the UI badge. */
export async function GET() {
  return NextResponse.json(await getAppleFmStatus());
}
