import { ascFetch } from "./client";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache";

const APP_INFO_TTL = 60 * 60 * 1000; // 1 hour

export interface AscAppInfo {
  id: string;
  attributes: {
    appStoreState: string;
    appStoreAgeRating: string | null;
    brazilAgeRating: string | null;
    brazilAgeRatingV2: string | null;
    state: string;
  };
  primaryCategory: AscCategory | null;
  secondaryCategory: AscCategory | null;
}

export interface AscCategory {
  id: string;
  attributes: {
    platforms: string[];
    parent: string | null;
  };
}

export interface AscAppInfoLocalization {
  id: string;
  attributes: {
    locale: string;
    name: string | null;
    subtitle: string | null;
    privacyPolicyText: string | null;
    privacyPolicyUrl: string | null;
    privacyChoicesUrl: string | null;
  };
}

interface AscAppInfosResponse {
  data: Array<{
    id: string;
    type: string;
    attributes: AscAppInfo["attributes"];
    relationships?: {
      primaryCategory?: { data: { id: string; type: string } | null };
      secondaryCategory?: { data: { id: string; type: string } | null };
    };
  }>;
  included?: Array<{
    id: string;
    type: string;
    attributes: Record<string, unknown>;
  }>;
}

interface AscAppInfoLocalizationsResponse {
  data: Array<{
    id: string;
    type: string;
    attributes: AscAppInfoLocalization["attributes"];
  }>;
}

export async function listAppInfos(
  appId: string,
  forceRefresh = false,
): Promise<AscAppInfo[]> {
  const cacheKey = `appInfos:${appId}`;

  if (!forceRefresh) {
    const cached = cacheGet<AscAppInfo[]>(cacheKey);
    if (cached) return cached;
  }

  const response = await ascFetch<AscAppInfosResponse>(
    `/v1/apps/${appId}/appInfos` +
      `?include=primaryCategory,secondaryCategory` +
      `&fields[appInfos]=appStoreState,appStoreAgeRating,brazilAgeRating,brazilAgeRatingV2,state,primaryCategory,secondaryCategory` +
      `&fields[appCategories]=platforms,parent`,
  );

  const categories = new Map<string, AscCategory>();
  for (const item of response.included ?? []) {
    if (item.type === "appCategories") {
      categories.set(item.id, {
        id: item.id,
        attributes: item.attributes as unknown as AscCategory["attributes"],
      });
    }
  }

  const appInfos: AscAppInfo[] = response.data.map((info) => ({
    id: info.id,
    attributes: info.attributes,
    primaryCategory:
      categories.get(info.relationships?.primaryCategory?.data?.id ?? "") ?? null,
    secondaryCategory:
      categories.get(info.relationships?.secondaryCategory?.data?.id ?? "") ?? null,
  }));

  cacheSet(cacheKey, appInfos, APP_INFO_TTL);
  return appInfos;
}

export async function updateAppInfoCategories(
  appInfoId: string,
  appId: string,
  primaryCategoryId: string | null,
  secondaryCategoryId: string | null,
): Promise<void> {
  const relationships: Record<string, { data: { type: string; id: string } | null }> = {
    primaryCategory: primaryCategoryId
      ? { data: { type: "appCategories", id: primaryCategoryId } }
      : { data: null },
    secondaryCategory: secondaryCategoryId
      ? { data: { type: "appCategories", id: secondaryCategoryId } }
      : { data: null },
  };

  await ascFetch(`/v1/appInfos/${appInfoId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appInfos",
        id: appInfoId,
        relationships,
      },
    }),
  });

  cacheInvalidate(`appInfos:${appId}`);
}

export async function listAppInfoLocalizations(
  appInfoId: string,
  forceRefresh = false,
): Promise<AscAppInfoLocalization[]> {
  const cacheKey = `appInfoLocalizations:${appInfoId}`;

  if (!forceRefresh) {
    const cached = cacheGet<AscAppInfoLocalization[]>(cacheKey);
    if (cached) return cached;
  }

  const response = await ascFetch<AscAppInfoLocalizationsResponse>(
    `/v1/appInfos/${appInfoId}/appInfoLocalizations` +
      `?fields[appInfoLocalizations]=locale,name,subtitle,privacyPolicyText,privacyPolicyUrl,privacyChoicesUrl`,
  );

  const localizations: AscAppInfoLocalization[] = response.data.map((l) => ({
    id: l.id,
    attributes: l.attributes,
  }));

  cacheSet(cacheKey, localizations, APP_INFO_TTL);
  return localizations;
}
