import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAscFetch = vi.fn();
const mockCacheInvalidate = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  ascFetch: (...args: unknown[]) => mockAscFetch(...args),
}));

vi.mock("@/lib/cache", () => ({
  cacheInvalidate: (...args: unknown[]) => mockCacheInvalidate(...args),
}));

import {
  updateVersionAttributes,
  enablePhasedRelease,
  disablePhasedRelease,
  createVersion,
  deleteVersion,
  cancelSubmission,
  submitForReview,
  releaseVersion,
  selectBuildForVersion,
  invalidateVersionsCache,
} from "@/lib/asc/version-mutations";

describe("version-mutations", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidate.mockReset();
  });

  describe("updateVersionAttributes", () => {
    it("PATCHes version with given attributes", async () => {
      mockAscFetch.mockResolvedValue({});

      await updateVersionAttributes("ver-1", {
        releaseType: "MANUAL",
        earliestReleaseDate: "2025-01-01T00:00:00Z",
      });

      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appStoreVersions/ver-1",
        expect.objectContaining({ method: "PATCH" }),
      );

      const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
      expect(body.data.type).toBe("appStoreVersions");
      expect(body.data.id).toBe("ver-1");
      expect(body.data.attributes.releaseType).toBe("MANUAL");
      expect(body.data.attributes.earliestReleaseDate).toBe("2025-01-01T00:00:00Z");
    });
  });

  describe("enablePhasedRelease", () => {
    it("POSTs a phased release for the version", async () => {
      mockAscFetch.mockResolvedValue({});

      await enablePhasedRelease("ver-1");

      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appStoreVersionPhasedReleases",
        expect.objectContaining({ method: "POST" }),
      );

      const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
      expect(body.data.attributes.phasedReleaseState).toBe("INACTIVE");
      expect(body.data.relationships.appStoreVersion.data.id).toBe("ver-1");
    });
  });

  describe("disablePhasedRelease", () => {
    it("DELETEs the phased release", async () => {
      mockAscFetch.mockResolvedValue(null);

      await disablePhasedRelease("phased-1");

      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appStoreVersionPhasedReleases/phased-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("createVersion", () => {
    it("POSTs a new version and returns its ID", async () => {
      mockAscFetch.mockResolvedValue({ data: { id: "new-ver-1" } });

      const id = await createVersion("app-1", "2.0.0", "IOS");

      expect(id).toBe("new-ver-1");
      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appStoreVersions",
        expect.objectContaining({ method: "POST" }),
      );

      const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
      expect(body.data.attributes.versionString).toBe("2.0.0");
      expect(body.data.attributes.platform).toBe("IOS");
      expect(body.data.relationships.app.data.id).toBe("app-1");
    });

    it("invalidates the versions cache after creation", async () => {
      mockAscFetch.mockResolvedValue({ data: { id: "new-ver-1" } });

      await createVersion("app-1", "2.0.0", "IOS");

      expect(mockCacheInvalidate).toHaveBeenCalledWith("versions:app-1");
    });
  });

  describe("deleteVersion", () => {
    it("DELETEs the version", async () => {
      mockAscFetch.mockResolvedValue(null);

      await deleteVersion("ver-1");

      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appStoreVersions/ver-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("cancelSubmission", () => {
    it("fetches the submission then DELETEs it", async () => {
      mockAscFetch
        .mockResolvedValueOnce({ data: { id: "sub-1" } })
        .mockResolvedValueOnce(null);

      await cancelSubmission("ver-1");

      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appStoreVersions/ver-1/appStoreVersionSubmission",
      );
      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appStoreVersionSubmissions/sub-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  describe("submitForReview", () => {
    it("creates submission when no draft exists, adds item, then confirms", async () => {
      mockAscFetch
        .mockResolvedValueOnce({ data: [] }) // find drafts: none
        .mockResolvedValueOnce({ data: { id: "sub-1" } }) // create submission
        .mockResolvedValueOnce({}) // add item
        .mockResolvedValueOnce({}); // confirm

      await submitForReview("app-1", "ver-1", "MAC_OS");

      // Step 1: check for existing drafts
      expect(mockAscFetch.mock.calls[0][0]).toContain("/v1/apps/app-1/reviewSubmissions");

      // Step 1b: create new submission (no draft found)
      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/reviewSubmissions",
        expect.objectContaining({ method: "POST" }),
      );
      const createBody = JSON.parse(mockAscFetch.mock.calls[1][1].body);
      expect(createBody.data.type).toBe("reviewSubmissions");
      expect(createBody.data.attributes.platform).toBe("MAC_OS");
      expect(createBody.data.relationships.app.data.id).toBe("app-1");

      // Step 2: add version as item
      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/reviewSubmissionItems",
        expect.objectContaining({ method: "POST" }),
      );
      const itemBody = JSON.parse(mockAscFetch.mock.calls[2][1].body);
      expect(itemBody.data.relationships.reviewSubmission.data.id).toBe("sub-1");
      expect(itemBody.data.relationships.appStoreVersion.data.id).toBe("ver-1");

      // Step 3: confirm submission
      const confirmBody = JSON.parse(mockAscFetch.mock.calls[3][1].body);
      expect(confirmBody.data.attributes.submitted).toBe(true);
    });

    it("reuses an existing draft submission instead of creating a new one", async () => {
      mockAscFetch
        .mockResolvedValueOnce({ data: [
          { id: "existing-sub", attributes: { state: "READY_FOR_REVIEW" } },
        ] }) // find drafts: one exists
        .mockResolvedValueOnce({}) // add item
        .mockResolvedValueOnce({}); // confirm

      await submitForReview("app-1", "ver-1", "IOS");

      // Should NOT create a new submission – only 3 calls total
      expect(mockAscFetch).toHaveBeenCalledTimes(3);

      // Item should reference the existing submission
      const itemBody = JSON.parse(mockAscFetch.mock.calls[1][1].body);
      expect(itemBody.data.relationships.reviewSubmission.data.id).toBe("existing-sub");
    });

    it("throws when step 2 (add item) fails", async () => {
      mockAscFetch
        .mockResolvedValueOnce({ data: [] }) // find drafts: none
        .mockResolvedValueOnce({ data: { id: "sub-1" } }) // create
        .mockRejectedValueOnce(new Error("add item failed")); // add item fails

      await expect(submitForReview("app-1", "ver-1", "IOS")).rejects.toThrow("add item failed");
    });

    it("throws when step 3 (confirm) fails", async () => {
      mockAscFetch
        .mockResolvedValueOnce({ data: [] }) // find drafts: none
        .mockResolvedValueOnce({ data: { id: "sub-1" } }) // create
        .mockResolvedValueOnce({}) // add item
        .mockRejectedValueOnce(new Error("confirm failed")); // confirm fails

      await expect(submitForReview("app-1", "ver-1", "IOS")).rejects.toThrow("confirm failed");
    });

    it("falls through to create when listing drafts fails", async () => {
      mockAscFetch
        .mockRejectedValueOnce(new Error("list failed")) // find drafts fails
        .mockResolvedValueOnce({ data: { id: "sub-1" } }) // create
        .mockResolvedValueOnce({}) // add item
        .mockResolvedValueOnce({}); // confirm

      await submitForReview("app-1", "ver-1", "IOS");

      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/reviewSubmissions",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("releaseVersion", () => {
    it("POSTs a release request for the version", async () => {
      mockAscFetch.mockResolvedValue({});

      await releaseVersion("ver-1");

      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appStoreVersionReleaseRequests",
        expect.objectContaining({ method: "POST" }),
      );

      const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
      expect(body.data.type).toBe("appStoreVersionReleaseRequests");
      expect(body.data.relationships.appStoreVersion.data.id).toBe("ver-1");
    });
  });

  describe("selectBuildForVersion", () => {
    it("PATCHes the build relationship for the version", async () => {
      mockAscFetch.mockResolvedValue({});

      await selectBuildForVersion("ver-1", "build-1");

      expect(mockAscFetch).toHaveBeenCalledWith(
        "/v1/appStoreVersions/ver-1/relationships/build",
        expect.objectContaining({ method: "PATCH" }),
      );

      const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
      expect(body.data.type).toBe("builds");
      expect(body.data.id).toBe("build-1");
    });

    it("sends null data to remove the build", async () => {
      mockAscFetch.mockResolvedValue({});

      await selectBuildForVersion("ver-1", null);

      const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
      expect(body.data).toBeNull();
    });
  });

  describe("invalidateVersionsCache", () => {
    it("invalidates the cache for the given app", () => {
      invalidateVersionsCache("app-1");
      expect(mockCacheInvalidate).toHaveBeenCalledWith("versions:app-1");
    });
  });
});
