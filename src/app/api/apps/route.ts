import { NextResponse } from "next/server";
import { listApps } from "@/lib/asc/apps";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import { errorJson } from "@/lib/api-helpers";
import { isPro, FREE_LIMITS } from "@/lib/license";
import { isDemoMode, getDemoApps } from "@/lib/demo";
import { getFreeSelectedAppId } from "@/lib/app-preferences";

export async function GET(request: Request) {
  if (isDemoMode()) {
    return NextResponse.json({ apps: getDemoApps(), meta: null, truncated: false, needsAppSelection: false });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ apps: [], meta: null, truncated: false, needsAppSelection: false });
  }

  try {
    const allApps = await listApps();
    const meta = cacheGetMeta("apps");
    const pro = isPro();
    const picker = new URL(request.url).searchParams.has("picker");

    // Return all apps for the picker screen
    if (picker) {
      return NextResponse.json({ apps: allApps, meta, truncated: false, needsAppSelection: false });
    }

    const truncated = !pro && allApps.length > FREE_LIMITS.apps;

    if (truncated) {
      const selectedId = getFreeSelectedAppId();
      const selected = selectedId ? allApps.find((a) => a.id === selectedId) : null;
      const apps = selected ? [selected] : allApps.slice(0, FREE_LIMITS.apps);
      const needsAppSelection = !selected;

      return NextResponse.json({ apps, meta, truncated, needsAppSelection });
    }

    return NextResponse.json({ apps: allApps, meta, truncated, needsAppSelection: false });
  } catch (err) {
    return errorJson(err);
  }
}
