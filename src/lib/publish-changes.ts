import { syncLocalizationsFromData } from "@/lib/api-helpers";
import type { SyncError } from "@/lib/api-helpers";
import {
  updateVersionLocalization,
  createVersionLocalization,
  deleteVersionLocalization,
  invalidateLocalizationsCache,
  updateAppInfoLocalization,
  createAppInfoLocalization,
  deleteAppInfoLocalization,
  invalidateAppInfoLocalizationsCache,
} from "@/lib/asc/localization-mutations";
import { apiFetch } from "@/lib/api-fetch";
import type { SectionChange } from "@/lib/change-buffer";

function uiToAscReleaseType(ui: string): string {
  switch (ui) {
    case "manually": return "MANUAL";
    case "after-date": return "SCHEDULED";
    default: return "AFTER_APPROVAL";
  }
}

export interface PublishResult {
  section: string;
  scope: string;
  ok: boolean;
  errors: SyncError[];
}

/**
 * Publish a single section's buffered changes to ASC.
 * Returns a result per section indicating success/failure.
 */
export async function publishSection(
  change: SectionChange,
): Promise<PublishResult> {
  const { appId, section, scope, data, originalData } = change;
  const allErrors: SyncError[] = [];

  try {
    switch (section) {
      case "store-listing":
        await publishStoreListing(appId, scope, data, originalData, allErrors);
        break;
      case "details":
        await publishAppDetails(appId, scope, data, originalData, allErrors);
        break;
      case "keywords":
        await publishKeywords(appId, scope, data, originalData, allErrors);
        break;
      case "review":
        await publishReview(appId, scope, data);
        break;
      default:
        allErrors.push({ operation: "update", locale: "", message: `Unknown section: ${section}` });
    }
  } catch (err) {
    allErrors.push({
      operation: "update",
      locale: "",
      message: err instanceof Error ? err.message : "Publish failed",
    });
  }

  return { section, scope, ok: allErrors.length === 0, errors: allErrors };
}

// --- Store listing ---

async function publishStoreListing(
  appId: string,
  versionId: string,
  data: Record<string, unknown>,
  originalData: Record<string, unknown>,
  errors: SyncError[],
) {
  // Localizations
  const locales = data.locales as Record<string, Record<string, unknown>> | undefined;
  const localeIds = (originalData.localeIds ?? {}) as Record<string, string>;
  if (locales && Object.keys(locales).length > 0) {
    const result = await syncLocalizationsFromData(locales, localeIds, versionId, {
      update: updateVersionLocalization,
      create: createVersionLocalization,
      delete: deleteVersionLocalization,
      invalidateCache: () => invalidateLocalizationsCache(versionId),
    });
    errors.push(...result.errors);
  }

  // Release settings (UI format → ASC format)
  if (data.releaseType !== undefined) {
    const ascReleaseType = uiToAscReleaseType(data.releaseType as string);
    const scheduledDate = data.scheduledDate as string | null | undefined;
    const earliestReleaseDate = (data.releaseType === "after-date" && scheduledDate) ? scheduledDate : null;
    const res = await fetch(
      `${baseUrl()}/api/apps/${appId}/versions/${versionId}/release`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releaseType: ascReleaseType,
          earliestReleaseDate,
          phasedRelease: data.phasedRelease ?? false,
          phasedReleaseId: (originalData.phasedReleaseId as string) ?? null,
        }),
      },
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      errors.push({ operation: "update", locale: "", message: d.error ?? "Release settings failed" });
    }
  }

  // Build + copyright
  const versionAttrs: Record<string, unknown> = {};
  if (data.buildId !== undefined) versionAttrs.buildId = data.buildId;
  if (data.copyright !== undefined) versionAttrs.copyright = data.copyright;
  if (Object.keys(versionAttrs).length > 0) {
    await apiFetch(`/api/apps/${appId}/versions/${versionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(versionAttrs),
    });
  }
}

// --- App details ---

async function publishAppDetails(
  appId: string,
  appInfoId: string,
  data: Record<string, unknown>,
  originalData: Record<string, unknown>,
  errors: SyncError[],
) {
  // Localizations
  const locales = data.locales as Record<string, Record<string, unknown>> | undefined;
  const localeIds = (originalData.localeIds ?? {}) as Record<string, string>;
  if (locales && Object.keys(locales).length > 0) {
    const result = await syncLocalizationsFromData(locales, localeIds, appInfoId, {
      update: updateAppInfoLocalization,
      create: createAppInfoLocalization,
      delete: deleteAppInfoLocalization,
      invalidateCache: () => invalidateAppInfoLocalizationsCache(appInfoId),
    });
    errors.push(...result.errors);
  }

  // App attributes
  const appAttrs: Record<string, unknown> = {};
  if (data.contentRights !== undefined) appAttrs.contentRightsDeclaration = data.contentRights;
  if (data.notifUrl !== undefined) appAttrs.subscriptionStatusUrl = (data.notifUrl as string) || null;
  if (data.notifSandboxUrl !== undefined) appAttrs.subscriptionStatusUrlForSandbox = (data.notifSandboxUrl as string) || null;
  if (Object.keys(appAttrs).length > 0) {
    await apiFetch(`/api/apps/${appId}/attributes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(appAttrs),
    });
  }

  // Categories
  if (data.primaryCategoryId !== undefined || data.secondaryCategoryId !== undefined) {
    await apiFetch(`/api/apps/${appId}/info/${appInfoId}/categories`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryCategoryId: (data.primaryCategoryId as string) || null,
        secondaryCategoryId: (data.secondaryCategoryId as string) || null,
      }),
    });
  }
}

// --- Keywords ---

async function publishKeywords(
  appId: string,
  versionId: string,
  data: Record<string, unknown>,
  originalData: Record<string, unknown>,
  errors: SyncError[],
) {
  const locales = data.locales as Record<string, Record<string, unknown>> | undefined;
  const localeIds = (originalData.localeIds ?? {}) as Record<string, string>;
  if (locales && Object.keys(locales).length > 0) {
    const result = await syncLocalizationsFromData(locales, localeIds, versionId, {
      update: updateVersionLocalization,
      create: createVersionLocalization,
      delete: deleteVersionLocalization,
      invalidateCache: () => invalidateLocalizationsCache(versionId),
    });
    errors.push(...result.errors);
  }
}

// --- App review ---

async function publishReview(
  appId: string,
  versionId: string,
  data: Record<string, unknown>,
) {
  // Reconstruct attributes from flattened fields (exclude internal keys)
  const skipKeys = new Set(["_reviewDetailId", "locales", "localeIds", "phasedReleaseId"]);
  const attributes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!skipKeys.has(k)) attributes[k] = v;
  }
  await fetch(`${baseUrl()}/api/apps/${appId}/versions/${versionId}/review`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reviewDetailId: (data._reviewDetailId as string) ?? null,
      attributes,
    }),
  });
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}
