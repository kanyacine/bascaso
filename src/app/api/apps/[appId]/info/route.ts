import { NextResponse } from "next/server";
import { listAppInfos } from "@/lib/asc/app-info";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import { errorJson } from "@/lib/api-helpers";
import { isDemoMode, getDemoAppInfos } from "@/lib/demo";


export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const refresh = new URL(request.url).searchParams.has("refresh");

  if (isDemoMode()) {
    return NextResponse.json({ appInfos: getDemoAppInfos(appId), meta: null });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ appInfos: [], meta: null });
  }

  try {
    const appInfos = await listAppInfos(appId, refresh);
    const meta = cacheGetMeta(`appInfos:${appId}`);

    return NextResponse.json({ appInfos, meta });
  } catch (err) {
    return errorJson(err);
  }
}
