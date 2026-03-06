import { NextResponse } from "next/server";
import { updateVersionAttributes, selectBuildForVersion, deleteVersion, invalidateVersionsCache } from "@/lib/asc/version-mutations";
import { hasCredentials } from "@/lib/asc/client";
import { errorJson } from "@/lib/api-helpers";
import { isDemoMode } from "@/lib/demo";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appId: string; versionId: string }> },
) {
  const { appId, versionId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ ok: true });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No ASC credentials" }, { status: 400 });
  }

  const body = await request.json();
  const { versionString, buildId, copyright } = body as {
    versionString?: string;
    buildId?: string | null;
    copyright?: string;
  };

  if (!versionString && buildId === undefined && copyright === undefined) {
    return NextResponse.json(
      { error: "versionString, buildId, or copyright is required" },
      { status: 400 },
    );
  }

  try {
    const attrs: Record<string, string> = {};
    if (versionString) attrs.versionString = versionString;
    if (copyright !== undefined) attrs.copyright = copyright;
    if (Object.keys(attrs).length > 0) {
      await updateVersionAttributes(versionId, attrs);
    }
    if (buildId !== undefined) {
      await selectBuildForVersion(versionId, buildId);
    }
    invalidateVersionsCache(appId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ appId: string; versionId: string }> },
) {
  const { appId, versionId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ ok: true });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No credentials" }, { status: 401 });
  }

  try {
    await deleteVersion(versionId);
    invalidateVersionsCache(appId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err, 500);
  }
}
