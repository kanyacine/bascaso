import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/asc/client";
import {
  deleteScreenshot,
  invalidateScreenshotCache,
} from "@/lib/asc/screenshot-mutations";
import { errorJson } from "@/lib/api-helpers";
import { isDemoMode } from "@/lib/demo";

type RouteParams = {
  params: Promise<{
    appId: string;
    versionId: string;
    localizationId: string;
    screenshotId: string;
  }>;
};

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { localizationId, screenshotId } = await params;

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
    await deleteScreenshot(screenshotId);
    invalidateScreenshotCache(localizationId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
