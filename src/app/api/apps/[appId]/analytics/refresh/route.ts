import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import { cacheInvalidate } from "@/lib/cache";
import { buildAnalyticsData } from "@/lib/asc/analytics";
import { isDemoMode } from "@/lib/demo";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (isDemoMode() || !hasCredentials()) {
    return NextResponse.json({ ok: true });
  }

  // Invalidate cached analytics so the next GET returns pending
  cacheInvalidate(`analytics:${appId}`);
  cacheInvalidate(`perf-metrics:${appId}`);

  // Fire-and-forget: rebuild in background
  buildAnalyticsData(appId).catch((err) => {
    console.error(`[analytics] Background refresh failed for ${appId}:`, err);
  });

  return NextResponse.json({ ok: true });
}
