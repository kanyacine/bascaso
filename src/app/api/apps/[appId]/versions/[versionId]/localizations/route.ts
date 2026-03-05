import { NextResponse } from "next/server";
import { listLocalizations } from "@/lib/asc/localizations";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import {
  updateVersionLocalization,
  createVersionLocalization,
  deleteVersionLocalization,
  invalidateLocalizationsCache,
} from "@/lib/asc/localization-mutations";
import { errorJson, syncLocalizations } from "@/lib/api-helpers";
import { isDemoMode, getDemoVersionLocalizations } from "@/lib/demo";


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string; versionId: string }> },
) {
  const { versionId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ localizations: getDemoVersionLocalizations(versionId), meta: null });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ localizations: [], meta: null });
  }

  try {
    const localizations = await listLocalizations(versionId);
    const meta = cacheGetMeta(`localizations:${versionId}`);

    return NextResponse.json({ localizations, meta });
  } catch (err) {
    return errorJson(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ appId: string; versionId: string }> },
) {
  const { versionId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ ok: true, results: [] });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  try {
    return await syncLocalizations(request, versionId, {
      update: updateVersionLocalization,
      create: createVersionLocalization,
      delete: deleteVersionLocalization,
      invalidateCache: () => invalidateLocalizationsCache(versionId),
    });
  } catch (err) {
    return errorJson(err, 500);
  }
}
