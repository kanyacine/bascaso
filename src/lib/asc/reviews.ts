import { ascFetch } from "./client";
import { cacheInvalidate } from "@/lib/cache";
import { withCache } from "./helpers";
import { listVersions } from "./versions";

const REVIEWS_TTL = 5 * 60 * 1000; // 5 min

export interface AscCustomerReview {
  id: string;
  attributes: {
    rating: number;
    title: string;
    body: string;
    reviewerNickname: string;
    createdDate: string;
    territory: string; // ISO 3166-1 alpha-3
  };
  response?: AscReviewResponse;
}

export interface AscReviewResponse {
  id: string;
  attributes: {
    responseBody: string;
    lastModifiedDate: string;
    state: "PENDING_PUBLISH" | "PUBLISHED";
  };
}

interface AscCustomerReviewsResponse {
  data: Array<{
    id: string;
    type: "customerReviews";
    attributes: AscCustomerReview["attributes"];
    relationships?: {
      response?: {
        data?: { id: string; type: "customerReviewResponses" } | null;
      };
    };
  }>;
  included?: Array<{
    id: string;
    type: "customerReviewResponses";
    attributes: AscReviewResponse["attributes"];
  }>;
}

type ReviewSort = "-createdDate" | "createdDate" | "-rating" | "rating";

export async function listCustomerReviews(
  appId: string,
  sort: ReviewSort = "-createdDate",
  forceRefresh = false,
): Promise<AscCustomerReview[]> {
  return withCache(`reviews:${appId}:${sort}`, REVIEWS_TTL, forceRefresh, async () => {
    const params = new URLSearchParams({
      "fields[customerReviews]": "rating,title,body,reviewerNickname,createdDate,territory,response",
      "fields[customerReviewResponses]": "responseBody,lastModifiedDate,state",
      include: "response",
      sort,
      limit: "200",
    });

    const response = await ascFetch<AscCustomerReviewsResponse>(
      `/v1/apps/${appId}/customerReviews?${params}`,
    );

    // Build a lookup map for included responses
    const responseMap = new Map<string, AscReviewResponse>();
    if (response.included) {
      for (const inc of response.included) {
        if (inc.type === "customerReviewResponses") {
          responseMap.set(inc.id, {
            id: inc.id,
            attributes: inc.attributes,
          });
        }
      }
    }

    // Merge responses inline
    return response.data.map((r) => {
      const responseRef = r.relationships?.response?.data;
      const reviewResponse = responseRef ? responseMap.get(responseRef.id) : undefined;

      return {
        id: r.id,
        attributes: r.attributes,
        ...(reviewResponse ? { response: reviewResponse } : {}),
      };
    });
  });
}

/**
 * Fetch reviews filtered by platform. The app-level endpoint doesn't support
 * platform filtering, so we fetch via each appStoreVersion for the given
 * platform and deduplicate by review ID.
 */
export async function listCustomerReviewsByPlatform(
  appId: string,
  platform: string,
  sort: ReviewSort = "-createdDate",
  forceRefresh = false,
): Promise<AscCustomerReview[]> {
  return withCache(`reviews:${appId}:${platform}:${sort}`, REVIEWS_TTL, forceRefresh, async () => {
    const versions = await listVersions(appId);
    const platformVersionIds = versions
      .filter((v) => v.attributes.platform === platform)
      .map((v) => v.id);

    if (platformVersionIds.length === 0) return [];

    const params = new URLSearchParams({
      "fields[customerReviews]": "rating,title,body,reviewerNickname,createdDate,territory,response",
      "fields[customerReviewResponses]": "responseBody,lastModifiedDate,state",
      include: "response",
      sort,
      limit: "200",
    });

    const results = await Promise.all(
      platformVersionIds.map((versionId) =>
        ascFetch<AscCustomerReviewsResponse>(
          `/v1/appStoreVersions/${versionId}/customerReviews?${params}`,
        ).catch(() => null),
      ),
    );

    // Deduplicate by review ID across versions
    const seen = new Map<string, AscCustomerReview>();
    for (const response of results) {
      if (!response) continue;

      const responseMap = new Map<string, AscReviewResponse>();
      if (response.included) {
        for (const inc of response.included) {
          if (inc.type === "customerReviewResponses") {
            responseMap.set(inc.id, { id: inc.id, attributes: inc.attributes });
          }
        }
      }

      for (const r of response.data) {
        if (seen.has(r.id)) continue;
        const responseRef = r.relationships?.response?.data;
        const reviewResponse = responseRef ? responseMap.get(responseRef.id) : undefined;
        seen.set(r.id, {
          id: r.id,
          attributes: r.attributes,
          ...(reviewResponse ? { response: reviewResponse } : {}),
        });
      }
    }

    return [...seen.values()];
  });
}

export async function createReviewResponse(
  reviewId: string,
  responseBody: string,
): Promise<{ id: string }> {
  const result = await ascFetch<{
    data: { id: string; type: "customerReviewResponses" };
  }>("/v1/customerReviewResponses", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "customerReviewResponses",
        attributes: { responseBody },
        relationships: {
          review: {
            data: { type: "customerReviews", id: reviewId },
          },
        },
      },
    }),
  });

  // Invalidate all reviews caches for this review's app
  cacheInvalidate(`reviews:`);

  return { id: result.data.id };
}

export async function deleteReviewResponse(responseId: string): Promise<void> {
  await ascFetch(`/v1/customerReviewResponses/${responseId}`, {
    method: "DELETE",
  });

  cacheInvalidate(`reviews:`);
}

export function invalidateReviewsCache(appId: string): void {
  // Invalidate all sort and platform variants
  cacheInvalidate(`reviews:${appId}:`);
}
