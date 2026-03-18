import { NextResponse } from "next/server";
import { getReviewBeforeSaving, setReviewBeforeSaving } from "@/lib/app-preferences";

export async function GET() {
  return NextResponse.json({ enabled: getReviewBeforeSaving() });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const enabled = body.enabled === true;
  setReviewBeforeSaving(enabled);
  return NextResponse.json({ enabled });
}
