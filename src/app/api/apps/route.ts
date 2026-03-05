import { NextResponse } from "next/server";
import { listApps } from "@/lib/asc/apps";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import { errorJson } from "@/lib/api-helpers";
import { isPro, FREE_LIMITS } from "@/lib/license";
import { isDemoMode, getDemoApps } from "@/lib/demo";

export async function GET() {
  if (isDemoMode()) {
    return NextResponse.json({ apps: getDemoApps(), meta: null, truncated: false });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ apps: [], meta: null, truncated: false });
  }

  try {
    const allApps = await listApps();
    const meta = cacheGetMeta("apps");
    const pro = isPro();

    const truncated = !pro && allApps.length > FREE_LIMITS.apps;
    const apps = truncated ? allApps.slice(0, FREE_LIMITS.apps) : allApps;

    return NextResponse.json({ apps, meta, truncated });
  } catch (err) {
    return errorJson(err);
  }
}
