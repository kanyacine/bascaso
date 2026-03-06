import { NextResponse } from "next/server";
import { listAppInfoLocalizations } from "@/lib/asc/app-info";
import { hasCredentials } from "@/lib/asc/client";
import { cacheGetMeta } from "@/lib/cache";
import {
  updateAppInfoLocalization,
  createAppInfoLocalization,
  deleteAppInfoLocalization,
  invalidateAppInfoLocalizationsCache,
} from "@/lib/asc/localization-mutations";
import { errorJson, syncLocalizations } from "@/lib/api-helpers";
import { isDemoMode, getDemoAppInfoLocalizations } from "@/lib/demo";


export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string; appInfoId: string }> },
) {
  const { appInfoId } = await params;
  const refresh = new URL(request.url).searchParams.has("refresh");

  if (isDemoMode()) {
    return NextResponse.json({ localizations: getDemoAppInfoLocalizations(appInfoId), meta: null });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ localizations: [], meta: null });
  }

  try {
    const localizations = await listAppInfoLocalizations(appInfoId, refresh);
    const meta = cacheGetMeta(`appInfoLocalizations:${appInfoId}`);

    return NextResponse.json({ localizations, meta });
  } catch (err) {
    return errorJson(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ appId: string; appInfoId: string }> },
) {
  const { appInfoId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ ok: true, results: [] });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  try {
    return await syncLocalizations(request, appInfoId, {
      update: updateAppInfoLocalization,
      create: createAppInfoLocalization,
      delete: deleteAppInfoLocalization,
      invalidateCache: () => invalidateAppInfoLocalizationsCache(appInfoId),
    });
  } catch (err) {
    return errorJson(err, 500);
  }
}
