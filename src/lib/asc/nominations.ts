import { ascFetch } from "./client";
import { cacheInvalidate } from "@/lib/cache";
import { withCache } from "./helpers";

const NOMINATIONS_TTL = 15 * 60 * 1000; // 15 min

// ── Types ────────────────────────────────────────────────────────────

export type NominationType = "APP_LAUNCH" | "APP_ENHANCEMENTS" | "NEW_CONTENT";
export type NominationState = "DRAFT" | "SUBMITTED" | "ARCHIVED";

export interface AscNomination {
  id: string;
  attributes: {
    name: string;
    description: string;
    notes: string | null;
    type: NominationType;
    state: NominationState;
    publishStartDate: string;
    publishEndDate: string | null;
    deviceFamilies: string[] | null;
    locales: string[] | null;
    hasInAppEvents: boolean | null;
    launchInSelectMarketsFirst: boolean | null;
    preOrderEnabled: boolean | null;
    supplementalMaterialsUris: string[] | null;
    createdDate: string;
    lastModifiedDate: string;
    submittedDate: string | null;
  };
  relatedAppIds: string[];
}

interface AscNominationsResponse {
  data: Array<{
    id: string;
    type: "nominations";
    attributes: AscNomination["attributes"];
    relationships?: {
      relatedApps?: {
        data?: Array<{ id: string; type: "apps" }>;
      };
    };
  }>;
}

interface AscNominationResponse {
  data: {
    id: string;
    type: "nominations";
    attributes: AscNomination["attributes"];
    relationships?: {
      relatedApps?: {
        data?: Array<{ id: string; type: "apps" }>;
      };
    };
  };
}

// ── Read ─────────────────────────────────────────────────────────────

export async function listNominations(
  forceRefresh = false,
): Promise<AscNomination[]> {
  return withCache("nominations", NOMINATIONS_TTL, forceRefresh, async () => {
    const fields =
      "name,description,notes,type,state,publishStartDate,publishEndDate," +
      "deviceFamilies,locales,hasInAppEvents,launchInSelectMarketsFirst," +
      "preOrderEnabled,supplementalMaterialsUris,createdDate,lastModifiedDate,submittedDate," +
      "relatedApps";

    // ASC requires filter[state] – fetch all three states in parallel
    const states: NominationState[] = ["DRAFT", "SUBMITTED", "ARCHIVED"];
    const all = await Promise.all(
      states.map(async (state) => {
        const params = new URLSearchParams({
          "fields[nominations]": fields,
          "filter[state]": state,
          include: "relatedApps",
          "fields[apps]": "name",
          limit: "200",
        });

        const response = await ascFetch<AscNominationsResponse>(
          `/v1/nominations?${params}`,
        );

        return response.data.map((n) => ({
          id: n.id,
          attributes: n.attributes,
          relatedAppIds:
            n.relationships?.relatedApps?.data?.map((a) => a.id) ?? [],
        }));
      }),
    );

    return all.flat();
  });
}

export async function getNomination(id: string): Promise<AscNomination> {
  const params = new URLSearchParams({
    "fields[nominations]":
      "name,description,notes,type,state,publishStartDate,publishEndDate," +
      "deviceFamilies,locales,hasInAppEvents,launchInSelectMarketsFirst," +
      "preOrderEnabled,supplementalMaterialsUris,createdDate,lastModifiedDate,submittedDate," +
      "relatedApps",
    include: "relatedApps",
    "fields[apps]": "name",
  });

  const response = await ascFetch<AscNominationResponse>(
    `/v1/nominations/${id}?${params}`,
  );

  return {
    id: response.data.id,
    attributes: response.data.attributes,
    relatedAppIds:
      response.data.relationships?.relatedApps?.data?.map((a) => a.id) ?? [],
  };
}

// ── Create ───────────────────────────────────────────────────────────

export interface CreateNominationInput {
  name: string;
  description: string;
  notes?: string;
  type: NominationType;
  publishStartDate: string;
  publishEndDate?: string;
  deviceFamilies?: string[];
  locales?: string[];
  hasInAppEvents?: boolean;
  launchInSelectMarketsFirst?: boolean;
  preOrderEnabled?: boolean;
  supplementalMaterialsUris?: string[];
  submitted: boolean;
  relatedAppIds: string[];
}

export async function createNomination(
  input: CreateNominationInput,
): Promise<string> {
  const {
    relatedAppIds,
    submitted,
    notes,
    publishEndDate,
    deviceFamilies,
    locales,
    hasInAppEvents,
    launchInSelectMarketsFirst,
    preOrderEnabled,
    supplementalMaterialsUris,
    ...requiredAttrs
  } = input;

  const attributes: Record<string, unknown> = {
    ...requiredAttrs,
    submitted,
    ...(notes != null && { notes }),
    ...(publishEndDate != null && { publishEndDate }),
    ...(deviceFamilies != null && { deviceFamilies }),
    ...(locales != null && { locales }),
    ...(hasInAppEvents != null && { hasInAppEvents }),
    ...(launchInSelectMarketsFirst != null && { launchInSelectMarketsFirst }),
    ...(preOrderEnabled != null && { preOrderEnabled }),
    ...(supplementalMaterialsUris != null && { supplementalMaterialsUris }),
  };

  const result = await ascFetch<AscNominationResponse>("/v1/nominations", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "nominations",
        attributes,
        relationships: {
          relatedApps: {
            data: relatedAppIds.map((id) => ({ type: "apps", id })),
          },
        },
      },
    }),
  });

  invalidateNominationsCache();
  return result.data.id;
}

// ── Update ───────────────────────────────────────────────────────────

export async function updateNomination(
  id: string,
  attributes: Record<string, unknown>,
): Promise<void> {
  await ascFetch(`/v1/nominations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "nominations",
        id,
        attributes,
      },
    }),
  });

  invalidateNominationsCache();
}

// ── Delete ───────────────────────────────────────────────────────────

export async function deleteNomination(id: string): Promise<void> {
  await ascFetch(`/v1/nominations/${id}`, { method: "DELETE" });
  invalidateNominationsCache();
}

// ── Cache ────────────────────────────────────────────────────────────

export function invalidateNominationsCache(): void {
  cacheInvalidate("nominations");
}
