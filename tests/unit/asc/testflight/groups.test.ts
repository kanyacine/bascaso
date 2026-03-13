import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAscFetch = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheInvalidatePrefix = vi.fn();
const mockBuildIconUrl = vi.fn();
const mockFetchBuildMetrics = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  ascFetch: (...args: unknown[]) => mockAscFetch(...args),
}));

vi.mock("@/lib/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheInvalidatePrefix: (...args: unknown[]) => mockCacheInvalidatePrefix(...args),
}));

vi.mock("@/lib/asc/apps", () => ({
  buildIconUrl: (...args: unknown[]) => mockBuildIconUrl(...args),
}));

vi.mock("@/lib/asc/testflight/builds", () => ({
  fetchBuildMetrics: (...args: unknown[]) => mockFetchBuildMetrics(...args),
}));

import {
  listGroups,
  getGroupDetail,
  createGroup,
  deleteGroup,
  fetchTesterMetrics,
} from "@/lib/asc/testflight/groups";
import { GROUPS_TTL, GROUP_DETAIL_TTL } from "@/lib/asc/testflight/types";

// ── Helpers ────────────────────────────────────────────────────────

function makeGroupResource(id: string, attrs: Record<string, unknown> = {}) {
  return {
    id,
    type: "betaGroups",
    attributes: {
      name: `Group ${id}`,
      isInternalGroup: false,
      publicLinkEnabled: false,
      publicLink: null,
      publicLinkLimit: null,
      publicLinkLimitEnabled: false,
      feedbackEnabled: false,
      hasAccessToAllBuilds: false,
      createdDate: "2025-06-01T00:00:00Z",
      ...attrs,
    },
  };
}

function makeBuildResource(id: string, attrs: Record<string, unknown> = {}) {
  return {
    id,
    type: "builds",
    attributes: {
      version: "42",
      uploadedDate: "2025-07-01T12:00:00Z",
      processingState: "VALID",
      expirationDate: "2025-10-01T00:00:00Z",
      expired: false,
      iconAssetToken: null,
      ...attrs,
    },
  };
}

function makeTesterResource(id: string, attrs: Record<string, unknown> = {}) {
  return {
    id,
    type: "betaTesters",
    attributes: {
      firstName: "Jane",
      lastName: "Doe",
      email: `${id}@example.com`,
      inviteType: "EMAIL",
      state: "ACCEPTED",
      ...attrs,
    },
  };
}

// ── listGroups ─────────────────────────────────────────────────────

describe("listGroups", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheInvalidatePrefix.mockReset();
  });

  it("returns cached data without calling API", async () => {
    const cached = [
      { id: "g1", name: "Internal", isInternal: true, testerCount: 3, buildCount: 1 },
    ];
    mockCacheGet.mockReturnValue(cached);

    const result = await listGroups("app-1");
    expect(result).toBe(cached);
    expect(mockCacheGet).toHaveBeenCalledWith("tf-groups:app-1");
    expect(mockAscFetch).not.toHaveBeenCalled();
  });

  it("fetches from API on cache miss, builds group objects with counts, and caches result", async () => {
    mockCacheGet.mockReturnValue(null);

    const group1 = makeGroupResource("g1", { name: "Beta testers", isInternalGroup: true });
    const group2 = makeGroupResource("g2", { name: "External group", publicLinkEnabled: true, publicLink: "https://testflight.apple.com/join/abc" });

    mockAscFetch
      // Main betaGroups list
      .mockResolvedValueOnce({ data: [group1, group2] })
      // g1 testers count
      .mockResolvedValueOnce({ data: [], meta: { paging: { total: 5 } } })
      // g1 builds count
      .mockResolvedValueOnce({ data: [], meta: { paging: { total: 2 } } })
      // g2 testers count
      .mockResolvedValueOnce({ data: [], meta: { paging: { total: 10 } } })
      // g2 builds count
      .mockResolvedValueOnce({ data: [], meta: { paging: { total: 3 } } });

    const result = await listGroups("app-1");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "g1",
      name: "Beta testers",
      isInternal: true,
      testerCount: 5,
      buildCount: 2,
      publicLinkEnabled: false,
      publicLink: null,
      publicLinkLimit: null,
      publicLinkLimitEnabled: false,
      feedbackEnabled: false,
      hasAccessToAllBuilds: false,
      createdDate: "2025-06-01T00:00:00Z",
    });
    expect(result[1]).toMatchObject({
      id: "g2",
      name: "External group",
      testerCount: 10,
      buildCount: 3,
      publicLinkEnabled: true,
      publicLink: "https://testflight.apple.com/join/abc",
    });

    expect(mockCacheSet).toHaveBeenCalledWith("tf-groups:app-1", result, GROUPS_TTL);
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockCacheGet.mockReturnValue([{ id: "stale" }]);

    mockAscFetch
      .mockResolvedValueOnce({ data: [makeGroupResource("g1")] })
      // Tester count
      .mockResolvedValueOnce({ data: [], meta: { paging: { total: 0 } } })
      // Build count
      .mockResolvedValueOnce({ data: [], meta: { paging: { total: 0 } } });

    const result = await listGroups("app-1", true);

    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(mockAscFetch).toHaveBeenCalled();
    expect(result[0].id).toBe("g1");
  });

  it("handles count sub-query failures gracefully (defaults to 0)", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch
      .mockResolvedValueOnce({ data: [makeGroupResource("g1")] })
      // Tester count fails
      .mockRejectedValueOnce(new Error("network"))
      // Build count fails
      .mockRejectedValueOnce(new Error("network"));

    const result = await listGroups("app-1");

    expect(result[0].testerCount).toBe(0);
    expect(result[0].buildCount).toBe(0);
  });

  it("wraps a single resource into an array", async () => {
    mockCacheGet.mockReturnValue(null);

    // ASC returns single object instead of array for single-item responses
    mockAscFetch
      .mockResolvedValueOnce({ data: makeGroupResource("g-single") })
      .mockResolvedValueOnce({ data: [], meta: { paging: { total: 1 } } })
      .mockResolvedValueOnce({ data: [], meta: { paging: { total: 0 } } });

    const result = await listGroups("app-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("g-single");
  });
});

// ── getGroupDetail ─────────────────────────────────────────────────

describe("getGroupDetail", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheInvalidatePrefix.mockReset();
    mockBuildIconUrl.mockReset();
    mockFetchBuildMetrics.mockReset();
  });

  it("returns cached data without calling API", async () => {
    const cached = { group: { id: "g1" }, builds: [], testers: [] };
    mockCacheGet.mockReturnValue(cached);

    const result = await getGroupDetail("g1");
    expect(result).toBe(cached);
    expect(mockCacheGet).toHaveBeenCalledWith("tf-group:g1");
    expect(mockAscFetch).not.toHaveBeenCalled();
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockCacheGet.mockReturnValue({ group: { id: "stale" }, builds: [], testers: [] });

    // Group
    mockAscFetch.mockResolvedValueOnce({ data: makeGroupResource("g1") });
    // Builds
    mockAscFetch.mockResolvedValueOnce({ data: [] });
    // Testers
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    mockFetchBuildMetrics.mockResolvedValue(new Map());

    const result = await getGroupDetail("g1", true);

    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(mockAscFetch).toHaveBeenCalled();
    expect(result!.group.id).toBe("g1");
  });

  it("returns null when no group data is returned", async () => {
    mockCacheGet.mockReturnValue(null);

    // Group returns empty array
    mockAscFetch.mockResolvedValueOnce({ data: [] });
    // Builds
    mockAscFetch.mockResolvedValueOnce({ data: [] });
    // Testers
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    const result = await getGroupDetail("g-missing");
    expect(result).toBeNull();
  });

  it("returns full detail with group, builds, testers, and metrics", async () => {
    mockCacheGet.mockReturnValue(null);

    const group = makeGroupResource("g1", {
      name: "External testers",
      isInternalGroup: false,
      feedbackEnabled: true,
    });

    const build1 = makeBuildResource("b1", {
      version: "100",
      uploadedDate: "2025-07-10T12:00:00Z",
      iconAssetToken: { templateUrl: "https://example.com/{w}x{h}.{f}" },
    });
    const build2 = makeBuildResource("b2", {
      version: "99",
      uploadedDate: "2025-07-05T12:00:00Z",
    });

    const tester1 = makeTesterResource("t1", { firstName: "Alice", lastName: "Smith" });
    const tester2 = makeTesterResource("t2", { firstName: "Bob", lastName: "Jones" });

    // 1) Group fetch
    mockAscFetch.mockResolvedValueOnce({ data: group });
    // 2) Builds fetch
    mockAscFetch.mockResolvedValueOnce({ data: [build1, build2] });
    // 3) Testers fetch
    mockAscFetch.mockResolvedValueOnce({ data: [tester1, tester2] });

    // 4) preReleaseVersion for b1
    mockAscFetch.mockResolvedValueOnce({
      data: { id: "prv1", type: "preReleaseVersions", attributes: { version: "2.0", platform: "IOS" } },
    });
    // 5) buildBetaDetail for b1
    mockAscFetch.mockResolvedValueOnce({
      data: { id: "bbd1", type: "buildBetaDetails", attributes: { internalBuildState: "IN_BETA_TESTING", externalBuildState: "IN_BETA_TESTING" } },
    });
    // 6) preReleaseVersion for b2
    mockAscFetch.mockResolvedValueOnce({
      data: { id: "prv2", type: "preReleaseVersions", attributes: { version: "1.9", platform: "IOS" } },
    });
    // 7) buildBetaDetail for b2
    mockAscFetch.mockResolvedValueOnce({
      data: { id: "bbd2", type: "buildBetaDetails", attributes: { internalBuildState: "READY_FOR_BETA_TESTING", externalBuildState: "READY_FOR_BETA_TESTING" } },
    });

    mockBuildIconUrl.mockReturnValue("https://example.com/64x64.png");

    // Build metrics
    const buildMetricsMap = new Map([
      ["b1", { installs: 50, sessions: 120, crashes: 3 }],
    ]);
    mockFetchBuildMetrics.mockResolvedValue(buildMetricsMap);

    const result = await getGroupDetail("g1");
    expect(result).not.toBeNull();

    // Group assertions
    expect(result!.group).toMatchObject({
      id: "g1",
      name: "External testers",
      isInternal: false,
      feedbackEnabled: true,
      testerCount: 2,
      buildCount: 2,
    });

    // Builds should be sorted newest first
    expect(result!.builds).toHaveLength(2);
    expect(result!.builds[0].id).toBe("b1");
    expect(result!.builds[0]).toMatchObject({
      buildNumber: "100",
      versionString: "2.0",
      platform: "IOS",
      status: "Testing",
      internalBuildState: "IN_BETA_TESTING",
      externalBuildState: "IN_BETA_TESTING",
      iconUrl: "https://example.com/64x64.png",
      installs: 50,
      sessions: 120,
      crashes: 3,
      groupIds: ["g1"],
    });
    expect(result!.builds[1].id).toBe("b2");
    expect(result!.builds[1]).toMatchObject({
      buildNumber: "99",
      versionString: "1.9",
      installs: 0,
      sessions: 0,
      crashes: 0,
    });

    // Testers
    expect(result!.testers).toHaveLength(2);
    expect(result!.testers[0]).toMatchObject({
      id: "t1",
      firstName: "Alice",
      lastName: "Smith",
      email: "t1@example.com",
      inviteType: "EMAIL",
      state: "ACCEPTED",
    });

    // Icon URL helper called for b1 (which has an icon token)
    expect(mockBuildIconUrl).toHaveBeenCalledWith("https://example.com/{w}x{h}.{f}", 64);

    // Caching
    expect(mockCacheSet).toHaveBeenCalledWith("tf-group:g1", result, GROUP_DETAIL_TTL);
  });

  it("filters out expired builds", async () => {
    mockCacheGet.mockReturnValue(null);

    const group = makeGroupResource("g1");
    const activeBuild = makeBuildResource("b-active", { expired: false });
    const expiredBuild = makeBuildResource("b-expired", { expired: true });

    // Group
    mockAscFetch.mockResolvedValueOnce({ data: group });
    // Builds (includes expired)
    mockAscFetch.mockResolvedValueOnce({ data: [activeBuild, expiredBuild] });
    // Testers
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    // preReleaseVersion for active build only (expired is skipped)
    mockAscFetch.mockResolvedValueOnce({
      data: { id: "prv1", type: "preReleaseVersions", attributes: { version: "1.0", platform: "IOS" } },
    });
    // buildBetaDetail for active build only
    mockAscFetch.mockResolvedValueOnce({
      data: { id: "bbd1", type: "buildBetaDetails", attributes: { internalBuildState: "IN_BETA_TESTING", externalBuildState: null } },
    });

    mockFetchBuildMetrics.mockResolvedValue(new Map());

    const result = await getGroupDetail("g1");

    // Only the active build should be present
    expect(result!.builds).toHaveLength(1);
    expect(result!.builds[0].id).toBe("b-active");
    // buildCount should reflect filtered count
    expect(result!.group.buildCount).toBe(1);
  });

  it("enriches testers with metrics from fetchTesterMetrics", async () => {
    mockCacheGet.mockReturnValue(null);

    const group = makeGroupResource("g1");
    const tester = makeTesterResource("t1");

    // Group
    mockAscFetch.mockResolvedValueOnce({ data: group });
    // Builds
    mockAscFetch.mockResolvedValueOnce({ data: [] });
    // Testers
    mockAscFetch.mockResolvedValueOnce({ data: [tester] });

    mockFetchBuildMetrics.mockResolvedValue(new Map());

    // fetchTesterMetrics is called internally by getGroupDetail.
    // Since we mocked the module, we need to mock the internal ascFetch calls for it.
    // Actually, getGroupDetail calls the exported fetchTesterMetrics directly,
    // which we've mocked at the module level. But wait -- getGroupDetail imports
    // fetchTesterMetrics from the same module. Since vi.mock replaces the module
    // at the import level but getGroupDetail uses a local reference, we need
    // to check how this actually works.
    //
    // Looking at the source: getGroupDetail calls fetchTesterMetrics(groupId)
    // which is a local function in the same file -- it won't go through the mock.
    // So we need to mock the ascFetch call that fetchTesterMetrics makes.

    // The tester metrics ascFetch call
    mockAscFetch.mockResolvedValueOnce({
      data: [
        {
          dimensions: {
            betaTesters: { data: { id: "t1" } },
          },
          dataPoints: [
            { values: { sessionCount: 15, crashCount: 2, feedbackCount: 4 } },
          ],
        },
      ],
    });

    const result = await getGroupDetail("g1");

    expect(result!.testers[0]).toMatchObject({
      id: "t1",
      sessions: 15,
      crashes: 2,
      feedbackCount: 4,
    });
  });

  it("sets iconUrl to null when build has no icon token", async () => {
    mockCacheGet.mockReturnValue(null);

    const group = makeGroupResource("g1");
    const build = makeBuildResource("b1", { iconAssetToken: null });

    mockAscFetch.mockResolvedValueOnce({ data: group });
    mockAscFetch.mockResolvedValueOnce({ data: [build] });
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    // preReleaseVersion
    mockAscFetch.mockResolvedValueOnce({
      data: { id: "prv1", type: "preReleaseVersions", attributes: { version: "1.0", platform: "IOS" } },
    });
    // buildBetaDetail
    mockAscFetch.mockResolvedValueOnce({
      data: { id: "bbd1", type: "buildBetaDetails", attributes: { internalBuildState: "IN_BETA_TESTING", externalBuildState: null } },
    });

    mockFetchBuildMetrics.mockResolvedValue(new Map());
    // tester metrics (no testers, so metrics endpoint still called)
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    const result = await getGroupDetail("g1");
    expect(result!.builds[0].iconUrl).toBeNull();
    expect(mockBuildIconUrl).not.toHaveBeenCalled();
  });

  it("handles sub-query failures for preReleaseVersion and buildBetaDetail", async () => {
    mockCacheGet.mockReturnValue(null);

    const group = makeGroupResource("g1");
    const build = makeBuildResource("b1");

    mockAscFetch.mockResolvedValueOnce({ data: group });
    mockAscFetch.mockResolvedValueOnce({ data: [build] });
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    // preReleaseVersion fails
    mockAscFetch.mockRejectedValueOnce(new Error("network error"));
    // buildBetaDetail fails
    mockAscFetch.mockRejectedValueOnce(new Error("network error"));

    mockFetchBuildMetrics.mockResolvedValue(new Map());
    // tester metrics
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    const result = await getGroupDetail("g1");

    // Build should still be present with fallback values
    expect(result!.builds).toHaveLength(1);
    expect(result!.builds[0].versionString).toBe("");
    expect(result!.builds[0].platform).toBe("IOS");
  });
});

// ── createGroup ────────────────────────────────────────────────────

describe("createGroup", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidatePrefix.mockReset();
  });

  it("POSTs the correct payload and returns parsed group", async () => {
    const responseGroup = makeGroupResource("g-new", {
      name: "QA testers",
      isInternalGroup: false,
      createdDate: "2025-08-01T00:00:00Z",
    });

    mockAscFetch.mockResolvedValueOnce({ data: responseGroup });

    const result = await createGroup("app-1", "QA testers", false);

    // Verify POST call
    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/betaGroups",
      expect.objectContaining({ method: "POST" }),
    );

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body).toEqual({
      data: {
        type: "betaGroups",
        attributes: { name: "QA testers", isInternalGroup: false },
        relationships: {
          app: { data: { type: "apps", id: "app-1" } },
        },
      },
    });

    // Verify returned group
    expect(result).toMatchObject({
      id: "g-new",
      name: "QA testers",
      isInternal: false,
      testerCount: 0,
      buildCount: 0,
      createdDate: "2025-08-01T00:00:00Z",
    });
  });

  it("creates an internal group", async () => {
    mockAscFetch.mockResolvedValueOnce({
      data: makeGroupResource("g-int", { name: "Internal QA", isInternalGroup: true }),
    });

    const result = await createGroup("app-1", "Internal QA", true);

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data.attributes.isInternalGroup).toBe(true);
    expect(result.isInternal).toBe(true);
  });

  it("invalidates the groups cache for the app", async () => {
    mockAscFetch.mockResolvedValueOnce({
      data: makeGroupResource("g-new"),
    });

    await createGroup("app-1", "New group", false);

    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-groups:app-1");
  });

  it("handles array response from ASC", async () => {
    mockAscFetch.mockResolvedValueOnce({
      data: [makeGroupResource("g-arr", { name: "From array" })],
    });

    const result = await createGroup("app-1", "From array", false);
    expect(result.id).toBe("g-arr");
    expect(result.name).toBe("From array");
  });

  it("handles response with missing attributes (exercises all ?? fallback branches)", async () => {
    // All optional attributes are undefined to exercise ?? fallbacks at lines 271-280
    mockAscFetch.mockResolvedValueOnce({
      data: {
        id: "g-sparse",
        type: "betaGroups",
        attributes: {
          name: "Sparse group",
          // isInternalGroup, publicLinkEnabled, publicLink, publicLinkLimit,
          // publicLinkLimitEnabled, feedbackEnabled, hasAccessToAllBuilds,
          // createdDate are all intentionally omitted (undefined)
        },
      },
    });

    const result = await createGroup("app-1", "Sparse group", false);

    expect(result.id).toBe("g-sparse");
    expect(result.name).toBe("Sparse group");
    expect(result.isInternal).toBe(false);
    expect(result.publicLinkEnabled).toBe(false);
    expect(result.publicLink).toBeNull();
    expect(result.publicLinkLimit).toBeNull();
    expect(result.publicLinkLimitEnabled).toBe(false);
    expect(result.feedbackEnabled).toBe(false);
    expect(result.hasAccessToAllBuilds).toBe(false);
    // createdDate falls back to new Date().toISOString()
    expect(result.createdDate).toBeDefined();
    expect(typeof result.createdDate).toBe("string");
  });
});

// ── deleteGroup ────────────────────────────────────────────────────

describe("deleteGroup", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidatePrefix.mockReset();
  });

  it("sends DELETE request for the group", async () => {
    mockAscFetch.mockResolvedValueOnce(undefined);

    await deleteGroup("g-del");

    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/betaGroups/g-del",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("invalidates all groups cache", async () => {
    mockAscFetch.mockResolvedValueOnce(undefined);

    await deleteGroup("g-del");

    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("tf-groups:");
  });
});

// ── fetchTesterMetrics ─────────────────────────────────────────────

describe("fetchTesterMetrics", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
  });

  it("parses nested metrics response correctly", async () => {
    mockAscFetch.mockResolvedValueOnce({
      data: [
        {
          dimensions: {
            betaTesters: { data: { id: "t1" } },
          },
          dataPoints: [
            { values: { sessionCount: 10, crashCount: 1, feedbackCount: 3 } },
            { values: { sessionCount: 5, crashCount: 0, feedbackCount: 1 } },
          ],
        },
        {
          dimensions: {
            betaTesters: { data: { id: "t2" } },
          },
          dataPoints: [
            { values: { sessionCount: 20, crashCount: 2, feedbackCount: 0 } },
          ],
        },
      ],
    });

    const result = await fetchTesterMetrics("g1");

    expect(result.size).toBe(2);
    expect(result.get("t1")).toEqual({ sessions: 15, crashes: 1, feedbackCount: 4 });
    expect(result.get("t2")).toEqual({ sessions: 20, crashes: 2, feedbackCount: 0 });

    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/betaGroups/g1/metrics/betaTesterUsages?groupBy=betaTesters",
    );
  });

  it("handles errors gracefully and returns empty map", async () => {
    mockAscFetch.mockRejectedValueOnce(new Error("500 Internal Server Error"));

    const result = await fetchTesterMetrics("g-err");

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("skips entries without tester ID", async () => {
    mockAscFetch.mockResolvedValueOnce({
      data: [
        {
          dimensions: {},
          dataPoints: [{ values: { sessionCount: 10 } }],
        },
        {
          dimensions: { betaTesters: { data: null } },
          dataPoints: [{ values: { sessionCount: 5 } }],
        },
        {
          dimensions: { betaTesters: { data: { id: "t-valid" } } },
          dataPoints: [{ values: { sessionCount: 7, crashCount: 0, feedbackCount: 1 } }],
        },
      ],
    });

    const result = await fetchTesterMetrics("g1");

    expect(result.size).toBe(1);
    expect(result.get("t-valid")).toEqual({ sessions: 7, crashes: 0, feedbackCount: 1 });
  });

  it("handles empty data array", async () => {
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    const result = await fetchTesterMetrics("g1");
    expect(result.size).toBe(0);
  });

  it("handles missing values in dataPoints gracefully", async () => {
    mockAscFetch.mockResolvedValueOnce({
      data: [
        {
          dimensions: { betaTesters: { data: { id: "t1" } } },
          dataPoints: [
            { values: { sessionCount: 3 } },
            { values: null },
            {},
          ],
        },
      ],
    });

    const result = await fetchTesterMetrics("g1");

    // Only the first dataPoint has valid values; others are skipped
    expect(result.get("t1")).toEqual({ sessions: 3, crashes: 0, feedbackCount: 0 });
  });

  it("returns empty map when response data is not an array", async () => {
    mockAscFetch.mockResolvedValueOnce({ data: { notAnArray: true } });

    const result = await fetchTesterMetrics("g1");
    expect(result.size).toBe(0);
  });

  it("handles dataPoints with undefined metric values (exercises ?? 0 fallbacks)", async () => {
    mockAscFetch.mockResolvedValueOnce({
      data: [
        {
          dimensions: { betaTesters: { data: { id: "t-sparse" } } },
          dataPoints: [
            // values object exists but individual counts are undefined
            { values: {} },
          ],
        },
      ],
    });

    const result = await fetchTesterMetrics("g1");

    expect(result.get("t-sparse")).toEqual({ sessions: 0, crashes: 0, feedbackCount: 0 });
  });

  it("handles non-array dataPoints (exercises fallback to empty array)", async () => {
    mockAscFetch.mockResolvedValueOnce({
      data: [
        {
          dimensions: { betaTesters: { data: { id: "t-nodp" } } },
          // dataPoints is not an array
          dataPoints: "invalid",
        },
      ],
    });

    const result = await fetchTesterMetrics("g1");

    expect(result.get("t-nodp")).toEqual({ sessions: 0, crashes: 0, feedbackCount: 0 });
  });
});

// ── Branch coverage: listGroups edge cases ──────────────────────

describe("listGroups – branch coverage", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheInvalidatePrefix.mockReset();
  });

  it("handles group with all attributes missing (exercises ?? fallbacks on lines 69-77)", async () => {
    mockCacheGet.mockReturnValue(null);

    // Group with only name present, all other attributes undefined
    mockAscFetch
      .mockResolvedValueOnce({
        data: [
          {
            id: "g-sparse",
            type: "betaGroups",
            attributes: {
              name: "Sparse group",
              createdDate: "2025-06-01T00:00:00Z",
              // isInternalGroup, publicLinkEnabled, publicLink, publicLinkLimit,
              // publicLinkLimitEnabled, feedbackEnabled, hasAccessToAllBuilds
              // are all intentionally omitted (undefined)
            },
          },
        ],
      })
      // Tester count
      .mockResolvedValueOnce({ data: [], meta: { paging: { total: 2 } } })
      // Build count
      .mockResolvedValueOnce({ data: [], meta: { paging: { total: 1 } } });

    const result = await listGroups("app-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "g-sparse",
      name: "Sparse group",
      isInternal: false,
      testerCount: 2,
      buildCount: 1,
      publicLinkEnabled: false,
      publicLink: null,
      publicLinkLimit: null,
      publicLinkLimitEnabled: false,
      feedbackEnabled: false,
      hasAccessToAllBuilds: false,
      createdDate: "2025-06-01T00:00:00Z",
    });
  });

  it("falls back to 0 for counts when countResults promise rejects (line 70 counts?.testerCount ?? 0)", async () => {
    mockCacheGet.mockReturnValue(null);

    // Return group data, then make both count sub-queries reject at the allSettled level
    // by throwing inside the async mapper
    mockAscFetch
      .mockResolvedValueOnce({ data: [makeGroupResource("g1")] })
      // Both testers and builds throw – this causes the Promise.all inside the mapper to reject,
      // which means the allSettled result will be "rejected", and countsMap won't have this group
      .mockRejectedValueOnce(new Error("testers fail"))
      .mockRejectedValueOnce(new Error("builds fail"));

    const result = await listGroups("app-1");

    // countsMap has no entry for g1, so counts is undefined → counts?.testerCount ?? 0
    expect(result[0].testerCount).toBe(0);
    expect(result[0].buildCount).toBe(0);
  });

  it("handles rejected countResults entry when ascFetch throws synchronously (line 58 else + lines 70-71)", async () => {
    mockCacheGet.mockReturnValue(null);

    let callCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mockAscFetch.mockImplementation((_url: string) => {
      callCount++;
      // First call: betaGroups list
      if (callCount === 1) {
        return Promise.resolve({ data: [makeGroupResource("g1")] });
      }
      // Second call (tester count for g1): throw synchronously
      // This causes the async mapper to reject before .catch() can be attached
      throw new Error("synchronous explosion");
    });

    const result = await listGroups("app-1");

    // The allSettled entry for g1 is rejected, so countsMap has no entry for g1
    // counts is undefined → counts?.testerCount ?? 0 and counts?.buildCount ?? 0
    expect(result).toHaveLength(1);
    expect(result[0].testerCount).toBe(0);
    expect(result[0].buildCount).toBe(0);
  });

  it("falls back to 0 when tester/build count responses lack meta.paging.total (lines 119-120)", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch
      .mockResolvedValueOnce({ data: [makeGroupResource("g1")] })
      // Tester count – response without meta.paging.total
      .mockResolvedValueOnce({ data: [] })
      // Build count – response without meta.paging.total
      .mockResolvedValueOnce({ data: [] });

    const result = await listGroups("app-1");

    expect(result[0].testerCount).toBe(0);
    expect(result[0].buildCount).toBe(0);
  });

  it("falls back to 0 when count responses have meta but no paging (lines 119-120)", async () => {
    mockCacheGet.mockReturnValue(null);

    mockAscFetch
      .mockResolvedValueOnce({ data: [makeGroupResource("g1")] })
      // Tester count – response with meta but no paging
      .mockResolvedValueOnce({ data: [], meta: {} })
      // Build count – response with meta.paging but no total
      .mockResolvedValueOnce({ data: [], meta: { paging: {} } });

    const result = await listGroups("app-1");

    expect(result[0].testerCount).toBe(0);
    expect(result[0].buildCount).toBe(0);
  });
});

// ── Branch coverage: getGroupDetail edge cases ──────────────────

describe("getGroupDetail – branch coverage", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheInvalidatePrefix.mockReset();
    mockBuildIconUrl.mockReset();
    mockFetchBuildMetrics.mockReset();
  });

  it("handles builds with missing expired and expirationDate attrs (lines 170, 182)", async () => {
    mockCacheGet.mockReturnValue(null);

    const group = makeGroupResource("g1");
    // Build with expired and expirationDate intentionally omitted
    const build = {
      id: "b-sparse",
      type: "builds",
      attributes: {
        version: "7",
        uploadedDate: "2025-07-01T12:00:00Z",
        processingState: "VALID",
        iconAssetToken: null,
        // expired and expirationDate are intentionally omitted
      },
    };

    // Group
    mockAscFetch.mockResolvedValueOnce({ data: group });
    // Builds
    mockAscFetch.mockResolvedValueOnce({ data: [build] });
    // Testers
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    // preReleaseVersion for the build
    mockAscFetch.mockResolvedValueOnce({
      data: { id: "prv1", type: "preReleaseVersions", attributes: { version: "1.0", platform: "IOS" } },
    });
    // buildBetaDetail for the build
    mockAscFetch.mockResolvedValueOnce({
      data: { id: "bbd1", type: "buildBetaDetails", attributes: { internalBuildState: "IN_BETA_TESTING", externalBuildState: null } },
    });

    mockFetchBuildMetrics.mockResolvedValue(new Map());
    // tester metrics
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    const result = await getGroupDetail("g1");

    expect(result!.builds).toHaveLength(1);
    expect(result!.builds[0].expired).toBe(false);
    expect(result!.builds[0].expirationDate).toBeNull();
  });

  it("handles testers with all attributes missing (lines 203-207 ?? fallbacks)", async () => {
    mockCacheGet.mockReturnValue(null);

    const group = makeGroupResource("g1");
    // Tester with all optional attributes omitted
    const tester = {
      id: "t-sparse",
      type: "betaTesters",
      attributes: {
        // firstName, lastName, email, inviteType, state are all intentionally omitted
      },
    };

    // Group
    mockAscFetch.mockResolvedValueOnce({ data: group });
    // Builds
    mockAscFetch.mockResolvedValueOnce({ data: [] });
    // Testers
    mockAscFetch.mockResolvedValueOnce({ data: [tester] });

    mockFetchBuildMetrics.mockResolvedValue(new Map());
    // tester metrics
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    const result = await getGroupDetail("g1");

    expect(result!.testers).toHaveLength(1);
    expect(result!.testers[0]).toMatchObject({
      id: "t-sparse",
      firstName: "Anonymous",
      lastName: "",
      email: null,
      inviteType: "EMAIL",
      state: "NOT_INVITED",
    });
  });

  it("handles getGroupDetail group attrs with missing optional fields (lines 127-135)", async () => {
    mockCacheGet.mockReturnValue(null);

    // Group resource with all optional attributes omitted
    const group = {
      id: "g-sparse",
      type: "betaGroups",
      attributes: {
        name: "Sparse detail group",
        createdDate: "2025-06-01T00:00:00Z",
        // isInternalGroup, publicLinkEnabled, publicLink, publicLinkLimit,
        // publicLinkLimitEnabled, feedbackEnabled, hasAccessToAllBuilds
        // are all intentionally omitted (undefined)
      },
    };

    // Group
    mockAscFetch.mockResolvedValueOnce({ data: group });
    // Builds
    mockAscFetch.mockResolvedValueOnce({ data: [] });
    // Testers
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    mockFetchBuildMetrics.mockResolvedValue(new Map());
    // tester metrics
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    const result = await getGroupDetail("g-sparse");

    expect(result!.group).toEqual({
      id: "g-sparse",
      name: "Sparse detail group",
      isInternal: false,
      testerCount: 0,
      buildCount: 0,
      publicLinkEnabled: false,
      publicLink: null,
      publicLinkLimit: null,
      publicLinkLimitEnabled: false,
      feedbackEnabled: false,
      hasAccessToAllBuilds: false,
      createdDate: "2025-06-01T00:00:00Z",
    });
  });

  it("wraps single-object tester/build responses into arrays (lines 119-120)", async () => {
    mockCacheGet.mockReturnValue(null);

    const group = makeGroupResource("g1");
    // Single build object instead of array
    const build = makeBuildResource("b-single");
    // Single tester object instead of array
    const tester = makeTesterResource("t-single");

    // Group
    mockAscFetch.mockResolvedValueOnce({ data: group });
    // Builds – single object, not array
    mockAscFetch.mockResolvedValueOnce({ data: build });
    // Testers – single object, not array
    mockAscFetch.mockResolvedValueOnce({ data: tester });

    // preReleaseVersion for the build
    mockAscFetch.mockResolvedValueOnce({
      data: { id: "prv1", type: "preReleaseVersions", attributes: { version: "1.0", platform: "IOS" } },
    });
    // buildBetaDetail for the build
    mockAscFetch.mockResolvedValueOnce({
      data: { id: "bbd1", type: "buildBetaDetails", attributes: { internalBuildState: "IN_BETA_TESTING", externalBuildState: null } },
    });

    mockFetchBuildMetrics.mockResolvedValue(new Map());
    // tester metrics
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    const result = await getGroupDetail("g1");

    expect(result!.builds).toHaveLength(1);
    expect(result!.builds[0].id).toBe("b-single");
    expect(result!.testers).toHaveLength(1);
    expect(result!.testers[0].id).toBe("t-single");
  });

  it("handles rejected buildDetails entry when ascFetch throws synchronously (line 158 else)", async () => {
    mockCacheGet.mockReturnValue(null);

    const group = makeGroupResource("g1");
    const build = makeBuildResource("b1");

    let callCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mockAscFetch.mockImplementation((_url: string) => {
      callCount++;
      // 1) Group fetch
      if (callCount === 1) return Promise.resolve({ data: group });
      // 2) Builds fetch
      if (callCount === 2) return Promise.resolve({ data: [build] });
      // 3) Testers fetch
      if (callCount === 3) return Promise.resolve({ data: [] });
      // 4) preReleaseVersion for b1: throw synchronously to cause allSettled "rejected"
      if (callCount === 4) throw new Error("synchronous throw in detail fetch");
      // 5) tester metrics
      return Promise.resolve({ data: [] });
    });

    mockFetchBuildMetrics.mockResolvedValue(new Map());

    const result = await getGroupDetail("g1");

    // buildDetails allSettled entry is rejected, so detailMap has no entry for b1
    // The build still appears but with fallback values
    expect(result!.builds).toHaveLength(1);
    expect(result!.builds[0].versionString).toBe("");
    expect(result!.builds[0].platform).toBe("IOS");
    expect(result!.builds[0].internalBuildState).toBeNull();
    expect(result!.builds[0].externalBuildState).toBeNull();
  });

  it("handles null tester/build data in getGroupDetail (empty array fallback)", async () => {
    mockCacheGet.mockReturnValue(null);

    const group = makeGroupResource("g1");

    // Group
    mockAscFetch.mockResolvedValueOnce({ data: group });
    // Builds – null data (falsy)
    mockAscFetch.mockResolvedValueOnce({ data: null });
    // Testers – null data (falsy)
    mockAscFetch.mockResolvedValueOnce({ data: null });

    mockFetchBuildMetrics.mockResolvedValue(new Map());
    // tester metrics
    mockAscFetch.mockResolvedValueOnce({ data: [] });

    const result = await getGroupDetail("g1");

    expect(result!.builds).toHaveLength(0);
    expect(result!.testers).toHaveLength(0);
    expect(result!.group.buildCount).toBe(0);
    expect(result!.group.testerCount).toBe(0);
  });
});
