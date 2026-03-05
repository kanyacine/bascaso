import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import {
  reorderScreenshots,
  invalidateScreenshotCache,
} from "@/lib/asc/screenshot-mutations";
import { errorJson } from "@/lib/api-helpers";
import { isDemoMode } from "@/lib/demo";

type RouteParams = {
  params: Promise<{
    appId: string;
    versionId: string;
    localizationId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  const { localizationId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ ok: true });
  }

  if (!hasCredentials()) {
    return NextResponse.json(
      { error: "No ASC credentials configured" },
      { status: 400 },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body?.setId || !Array.isArray(body?.screenshotIds)) {
      return NextResponse.json(
        { error: "Missing setId or screenshotIds" },
        { status: 400 },
      );
    }

    await reorderScreenshots(body.setId, body.screenshotIds);
    invalidateScreenshotCache(localizationId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
