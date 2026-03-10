import { ascFetch } from "./client";
import { cacheInvalidate } from "@/lib/cache";

export async function updateVersionAttributes(
  versionId: string,
  attributes: {
    versionString?: string;
    releaseType?: string;
    earliestReleaseDate?: string | null;
    copyright?: string;
  },
): Promise<void> {
  await ascFetch(`/v1/appStoreVersions/${versionId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appStoreVersions",
        id: versionId,
        attributes,
      },
    }),
  });
}

export async function enablePhasedRelease(versionId: string): Promise<void> {
  await ascFetch("/v1/appStoreVersionPhasedReleases", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appStoreVersionPhasedReleases",
        attributes: { phasedReleaseState: "INACTIVE" },
        relationships: {
          appStoreVersion: {
            data: { type: "appStoreVersions", id: versionId },
          },
        },
      },
    }),
  });
}

export async function disablePhasedRelease(
  phasedReleaseId: string,
): Promise<void> {
  await ascFetch(`/v1/appStoreVersionPhasedReleases/${phasedReleaseId}`, {
    method: "DELETE",
  });
}

export async function createVersion(
  appId: string,
  versionString: string,
  platform: string,
): Promise<string> {
  const res = await ascFetch<{ data: { id: string } }>("/v1/appStoreVersions", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appStoreVersions",
        attributes: { versionString, platform },
        relationships: {
          app: {
            data: { type: "apps", id: appId },
          },
        },
      },
    }),
  });

  cacheInvalidate(`versions:${appId}`);
  return res.data.id;
}

export async function deleteVersion(versionId: string): Promise<void> {
  await ascFetch(`/v1/appStoreVersions/${versionId}`, {
    method: "DELETE",
  });
}

export async function cancelSubmission(versionId: string): Promise<void> {
  const res = await ascFetch<{
    data: { id: string };
  }>(`/v1/appStoreVersions/${versionId}/appStoreVersionSubmission`);

  await ascFetch(`/v1/appStoreVersionSubmissions/${res.data.id}`, {
    method: "DELETE",
  });
}

/**
 * Cancel an UNRESOLVED_ISSUES review submission (after rejection).
 * PATCHes the submission with `canceled: true`, moving the version
 * back to PREPARE_FOR_SUBMISSION so it can be edited and resubmitted.
 */
export async function cancelUnresolvedSubmission(appId: string): Promise<void> {
  const submissionId = await findUnresolvedSubmission(appId);
  if (!submissionId) {
    throw new Error("No unresolved submission found");
  }
  await ascFetch(`/v1/reviewSubmissions/${submissionId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "reviewSubmissions",
        id: submissionId,
        attributes: { canceled: true },
      },
    }),
  });
}

export async function submitForReview(
  appId: string,
  versionId: string,
  platform: string,
): Promise<void> {
  // Find or create a READY_FOR_REVIEW submission, add item, confirm
  const submissionId = await findOrCreateReviewSubmission(appId, platform);

  await ascFetch("/v1/reviewSubmissionItems", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: {
            data: { type: "reviewSubmissions", id: submissionId },
          },
          appStoreVersion: {
            data: { type: "appStoreVersions", id: versionId },
          },
        },
      },
    }),
  });

  await confirmSubmission(submissionId);
}

async function confirmSubmission(submissionId: string): Promise<void> {
  await ascFetch(`/v1/reviewSubmissions/${submissionId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "reviewSubmissions",
        id: submissionId,
        attributes: { submitted: true },
      },
    }),
  });
}

/**
 * Find an UNRESOLVED_ISSUES submission for the app.
 * After rejection, the old submission moves to this state and still owns
 * the version. Re-confirming it resubmits for review.
 */
export async function findUnresolvedSubmission(appId: string): Promise<string | null> {
  try {
    const res = await ascFetch<{
      data: { id: string; attributes: { state: string } }[];
    }>(
      `/v1/apps/${appId}/reviewSubmissions?filter[state]=UNRESOLVED_ISSUES`,
    );
    if (res.data.length > 0) {
      return res.data[0].id;
    }
  } catch {
    // Fall through
  }
  return null;
}

async function findOrCreateReviewSubmission(
  appId: string,
  platform: string,
): Promise<string> {
  // Check for an existing draft submission we can reuse
  try {
    const res = await ascFetch<{
      data: { id: string; attributes: { state: string } }[];
    }>(
      `/v1/apps/${appId}/reviewSubmissions?filter[platform]=${platform}&filter[state]=READY_FOR_REVIEW`,
    );

    if (res.data.length > 0) {
      return res.data[0].id;
    }
  } catch {
    // If listing fails, fall through to create
  }

  const submission = await ascFetch<{ data: { id: string } }>(
    "/v1/reviewSubmissions",
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "reviewSubmissions",
          attributes: { platform },
          relationships: {
            app: {
              data: { type: "apps", id: appId },
            },
          },
        },
      }),
    },
  );

  return submission.data.id;
}

export async function releaseVersion(versionId: string): Promise<void> {
  await ascFetch("/v1/appStoreVersionReleaseRequests", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appStoreVersionReleaseRequests",
        relationships: {
          appStoreVersion: {
            data: { type: "appStoreVersions", id: versionId },
          },
        },
      },
    }),
  });
}

export async function selectBuildForVersion(
  versionId: string,
  buildId: string | null,
): Promise<void> {
  await ascFetch(`/v1/appStoreVersions/${versionId}/relationships/build`, {
    method: "PATCH",
    body: JSON.stringify({
      data: buildId ? { type: "builds", id: buildId } : null,
    }),
  });
}

export function invalidateVersionsCache(appId: string): void {
  cacheInvalidate(`versions:${appId}`);
}
