import { NextResponse } from "next/server";
import { listApps } from "@/lib/asc/apps";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import { errorJson } from "@/lib/api-helpers";
import { isDemoMode, getDemoApps } from "@/lib/demo";

export async function GET() {
  if (isDemoMode()) {
    return NextResponse.json({ apps: getDemoApps(), meta: null });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ apps: [], meta: null });
  }

  try {
    const apps = await listApps();
    const meta = cacheGetMeta("apps");
    return NextResponse.json({ apps, meta });
  } catch (err) {
    return errorJson(err);
  }
}
