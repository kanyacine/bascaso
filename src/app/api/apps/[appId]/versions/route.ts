import { NextResponse } from "next/server";
import { z } from "zod";
import { listVersions } from "@/lib/asc/versions";
import { createVersion, updateVersionAttributes, invalidateVersionsCache } from "@/lib/asc/version-mutations";
import { hasCredentials } from "@/lib/asc/client";
import { EDITABLE_STATES } from "@/lib/asc/version-types";
import { cacheGetMeta } from "@/lib/cache";
import { errorJson, parseBody } from "@/lib/api-helpers";
import { isDemoMode, getDemoVersions } from "@/lib/demo";

const createVersionSchema = z.object({
  versionString: z.string().min(1),
  platform: z.string().min(1),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ versions: getDemoVersions(appId), meta: null });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ versions: [], meta: null });
  }

  try {
    const versions = await listVersions(appId);
    const meta = cacheGetMeta(`versions:${appId}`);
    return NextResponse.json({ versions, meta });
  } catch (err) {
    return errorJson(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;

  if (isDemoMode()) {
    return NextResponse.json({ ok: true, versionId: "demo" });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ error: "No ASC credentials" }, { status: 400 });
  }

  const parsed = await parseBody(request, createVersionSchema);
  if (parsed instanceof Response) {
    return parsed;
  }
  const { versionString, platform } = parsed;

  try {
    // Check if there's already an editable version for this platform
    const versions = await listVersions(appId);
    const existing = versions.find(
      (v) =>
        v.attributes.platform === platform &&
        EDITABLE_STATES.has(v.attributes.appVersionState),
    );

    if (existing) {
      // Update the existing version's versionString instead of creating new
      await updateVersionAttributes(existing.id, { versionString });
      invalidateVersionsCache(appId);
      return NextResponse.json({ ok: true, versionId: existing.id }, { status: 200 });
    }

    const versionId = await createVersion(appId, versionString, platform);
    return NextResponse.json({ ok: true, versionId }, { status: 201 });
  } catch (err) {
    return errorJson(err);
  }
}
