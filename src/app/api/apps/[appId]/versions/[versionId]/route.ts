import { NextResponse } from "next/server";
import { z } from "zod";
import { updateVersionAttributes, selectBuildForVersion, deleteVersion, invalidateVersionsCache } from "@/lib/asc/version-mutations";
import { hasCredentials } from "@/lib/asc/client";
import { errorJson, parseBody } from "@/lib/api-helpers";
import { isDemoMode } from "@/lib/demo";

const updateVersionSchema = z
  .object({
    versionString: z.string().min(1).optional(),
    buildId: z.string().nullable().optional(),
    copyright: z.string().optional(),
  })
  .refine(
    (value) =>
      value.versionString !== undefined ||
      value.buildId !== undefined ||
      value.copyright !== undefined,
    {
      message: "versionString, buildId, or copyright is required",
    },
  );

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

  const parsed = await parseBody(request, updateVersionSchema);
  if (parsed instanceof Response) {
    return parsed;
  }
  const { versionString, buildId, copyright } = parsed;

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
