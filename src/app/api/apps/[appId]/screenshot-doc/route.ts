import { NextResponse } from "next/server";
import { z } from "zod";
import { currentDocExists, getOrCreateCurrentDoc, saveCurrentDoc } from "@/lib/screenshot-docs";
import { listApps } from "@/lib/asc/apps";
import { listLocalizations } from "@/lib/asc/localizations";
import { listScreenshotSets } from "@/lib/asc/screenshots";
import { listVersions } from "@/lib/asc/versions";
import { resolveVersion } from "@/lib/asc/version-types";
import { EDITOR_FORMATS } from "@/lib/screenshot-editor/devices";
import { parseBody, errorJson } from "@/lib/api-helpers";
import type { ScreenshotDoc } from "@/lib/screenshot-editor/types";

// The envelope is validated; screenshot internals stay unknown records – their deep shape is
// owned by types.ts and the reducer, and mirroring it here would be 150 lines drifting apart.
const docSchema = z.object({
  screenshots: z.array(z.record(z.string(), z.unknown())),
  selectedIndex: z.number().int().min(0),
  outputDevice: z.string().min(1),
  outputDevices: z.array(z.string().min(1)).optional(),
  customWidth: z.number().positive(),
  customHeight: z.number().positive(),
  currentLanguage: z.string().min(1),
  projectLanguages: z.array(z.string().min(1)).min(1),
  defaults: z.record(z.string(), z.unknown()),
});
const putSchema = z.object({ doc: docSchema });

type RouteParams = { params: Promise<{ appId: string }> };

/**
 * Working formats for a doc that does not exist yet: the display types the app already ships,
 * intersected with what the editor can render. `undefined` leaves createEmptyDoc on its default.
 * ponytail: probes the primary localization only – a shipped app has its screenshots there.
 */
async function shippedFormats(appId: string): Promise<string[] | undefined> {
  try {
    const [apps, versions] = await Promise.all([listApps(), listVersions(appId)]);
    const version = resolveVersion(versions, null);
    if (!version) return undefined;
    const localizations = await listLocalizations(version.id);
    const primaryLocale = apps.find((a) => a.id === appId)?.attributes.primaryLocale;
    const localization =
      localizations.find((l) => l.attributes.locale === primaryLocale) ?? localizations[0];
    if (!localization) return undefined;
    const shipped = new Set(
      (await listScreenshotSets(localization.id))
        .filter((s) => s.screenshots.length > 0)
        .map((s) => s.attributes.screenshotDisplayType),
    );
    const formats = EDITOR_FORMATS.filter((f) => shipped.has(f.key)).map((f) => f.key);
    return formats.length > 0 ? formats : undefined;
  } catch {
    return undefined; // no credentials, demo mode, ASC down – the default pair is a fine start
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { appId } = await params;
  try {
    const formats = currentDocExists(appId) ? undefined : await shippedFormats(appId);
    return NextResponse.json(getOrCreateCurrentDoc(appId, formats));
  } catch (err) {
    return errorJson(err);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { appId } = await params;
  const parsed = await parseBody(request, putSchema);
  if (parsed instanceof Response) return parsed;
  try {
    return NextResponse.json(saveCurrentDoc(appId, parsed.doc as unknown as ScreenshotDoc));
  } catch (err) {
    return errorJson(err);
  }
}
