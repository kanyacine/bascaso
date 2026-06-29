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

  // Keep accumulated analytics (history is never erased); just force a refresh
  // that fetches recent data and merges it in. Perf metrics aren't accumulated.
  cacheInvalidate(`perf-metrics:${appId}`);

  // Await the rebuild so the request stays open while work happens – this keeps
  // the refresh spinner spinning and ensures the next GET returns fresh data.
  // Only phase 1 is awaited here; the deep backfill stays fire-and-forget.
  try {
    await buildAnalyticsData(appId, { force: true });
  } catch (err) {
    console.error(`[analytics] Refresh failed for ${appId}:`, err);
  }

  return NextResponse.json({ ok: true });
}
