import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListBuilds = vi.fn();
const mockUpdateBetaBuildLocalization = vi.fn();
const mockExpireBuild = vi.fn();
const mockNotifyTesters = vi.fn();
const mockSubmitForBetaReview = vi.fn();
const mockDeclareExportCompliance = vi.fn();
const mockListFeedback = vi.fn();
const mockDeleteFeedbackItem = vi.fn();
const mockGetFeedbackCrashLog = vi.fn();
const mockListPreReleaseVersions = vi.fn();
const mockGetBetaAppInfo = vi.fn();
const mockCreateBetaAppLocalization = vi.fn();
const mockDeleteBetaAppLocalization = vi.fn();
const mockUpdateBetaAppLocalization = vi.fn();
const mockUpdateBetaAppReviewDetail = vi.fn();
const mockUpdateBetaLicenseAgreement = vi.fn();
const mockHasCredentials = vi.fn();
const mockCacheGetMeta = vi.fn();
const mockErrorJson = vi.fn();
const mockGetCompletedFeedbackIds = vi.fn();
const mockIsDemoMode = vi.fn();
const mockGetDemoBuilds = vi.fn();
const mockGetDemoBuildDetail = vi.fn();
const mockGetDemoPreReleaseVersions = vi.fn();
const mockGetDemoTFInfo = vi.fn();
const mockSyncLocalizations = vi.fn();

vi.mock("@/lib/asc/testflight", () => ({
  listBuilds: (...args: unknown[]) => mockListBuilds(...args),
  updateBetaBuildLocalization: (...args: unknown[]) =>
    mockUpdateBetaBuildLocalization(...args),
  expireBuild: (...args: unknown[]) => mockExpireBuild(...args),
  notifyTesters: (...args: unknown[]) => mockNotifyTesters(...args),
  submitForBetaReview: (...args: unknown[]) => mockSubmitForBetaReview(...args),
  declareExportCompliance: (...args: unknown[]) =>
    mockDeclareExportCompliance(...args),
  listFeedback: (...args: unknown[]) => mockListFeedback(...args),
  deleteFeedbackItem: (...args: unknown[]) => mockDeleteFeedbackItem(...args),
  getFeedbackCrashLog: (...args: unknown[]) => mockGetFeedbackCrashLog(...args),
  listPreReleaseVersions: (...args: unknown[]) =>
    mockListPreReleaseVersions(...args),
  getBetaAppInfo: (...args: unknown[]) => mockGetBetaAppInfo(...args),
  createBetaAppLocalization: (...args: unknown[]) =>
    mockCreateBetaAppLocalization(...args),
  deleteBetaAppLocalization: (...args: unknown[]) =>
    mockDeleteBetaAppLocalization(...args),
  updateBetaAppLocalization: (...args: unknown[]) =>
    mockUpdateBetaAppLocalization(...args),
  updateBetaAppReviewDetail: (...args: unknown[]) =>
    mockUpdateBetaAppReviewDetail(...args),
  updateBetaLicenseAgreement: (...args: unknown[]) =>
    mockUpdateBetaLicenseAgreement(...args),
}));

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));

vi.mock("@/lib/cache", () => ({
  cacheGetMeta: (...args: unknown[]) => mockCacheGetMeta(...args),
  cacheInvalidatePrefix: vi.fn(),
}));

vi.mock("@/lib/feedback-completed", () => ({
  getCompletedFeedbackIds: (...args: unknown[]) => mockGetCompletedFeedbackIds(...args),
}));

vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
  getDemoBuilds: (...args: unknown[]) => mockGetDemoBuilds(...args),
  getDemoBuildDetail: (...args: unknown[]) => mockGetDemoBuildDetail(...args),
  getDemoPreReleaseVersions: (...args: unknown[]) =>
    mockGetDemoPreReleaseVersions(...args),
  getDemoTFInfo: (...args: unknown[]) => mockGetDemoTFInfo(...args),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
    syncLocalizations: (...args: unknown[]) => mockSyncLocalizations(...args),
  };
});

describe("more testflight routes", () => {
  beforeEach(() => {
    for (const mock of [
      mockListBuilds,
      mockUpdateBetaBuildLocalization,
      mockExpireBuild,
      mockNotifyTesters,
      mockSubmitForBetaReview,
      mockDeclareExportCompliance,
      mockListFeedback,
      mockDeleteFeedbackItem,
      mockGetFeedbackCrashLog,
      mockListPreReleaseVersions,
      mockGetBetaAppInfo,
      mockCreateBetaAppLocalization,
      mockDeleteBetaAppLocalization,
      mockUpdateBetaAppLocalization,
      mockUpdateBetaAppReviewDetail,
      mockUpdateBetaLicenseAgreement,
      mockCacheGetMeta,
      mockErrorJson,
      mockGetCompletedFeedbackIds,
      mockGetDemoBuilds,
      mockGetDemoBuildDetail,
      mockGetDemoPreReleaseVersions,
      mockGetDemoTFInfo,
      mockSyncLocalizations,
    ]) {
      mock.mockReset();
    }
    mockHasCredentials.mockReturnValue(true);
    mockIsDemoMode.mockReturnValue(false);
    mockGetCompletedFeedbackIds.mockReturnValue([]);
    mockErrorJson.mockImplementation(
      () => new Response(JSON.stringify({ error: "mapped" }), { status: 502 }),
    );
  });

  it("GET /testflight/builds forwards filters", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/builds/route"
    );

    mockListBuilds.mockResolvedValue([{ id: "build-1" }]);
    mockCacheGetMeta.mockReturnValue({ fetchedAt: 1 });

    const response = await GET(
      new Request("http://localhost?refresh=1&platform=IOS&version=1.0&lite=1"),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    const data = await response.json();

    expect(mockListBuilds).toHaveBeenCalledWith("app-1", true, {
      platform: "IOS",
      versionString: "1.0",
      lite: true,
    });
    expect(data).toEqual({ builds: [{ id: "build-1" }], meta: { fetchedAt: 1 } });
  });

  it("GET /testflight/builds handles demo, missing credentials, default cache key, and mapped errors", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/builds/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoBuilds.mockReturnValue([{ id: "demo-build" }]);
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ builds: [{ id: "demo-build" }], meta: null });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ builds: [], meta: null });

    mockHasCredentials.mockReturnValue(true);
    mockListBuilds.mockResolvedValueOnce([{ id: "build-2" }]);
    mockCacheGetMeta.mockReturnValueOnce({ fetchedAt: 2 });
    response = await GET(new Request("http://localhost?lite=1"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(mockCacheGetMeta).toHaveBeenCalledWith("tf-builds:app-1");
    expect(await response.json()).toEqual({ builds: [{ id: "build-2" }], meta: { fetchedAt: 2 } });

    mockListBuilds.mockRejectedValueOnce(new Error("boom"));
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("GET /testflight/builds/[buildId] returns 404 when build is missing", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/route"
    );

    mockListBuilds.mockResolvedValue([{ id: "build-2" }]);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Build not found");
  });

  it("GET /testflight/builds/[buildId] handles demo, missing credentials, success, and mapped errors", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoBuildDetail.mockReturnValue({ id: "build-1" });
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ build: { id: "build-1" }, meta: null });

    mockGetDemoBuildDetail.mockReturnValueOnce(null);
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "missing" }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Build not found" });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No ASC credentials" });

    mockHasCredentials.mockReturnValue(true);
    mockListBuilds.mockResolvedValueOnce([{ id: "build-1" }]);
    response = await GET(new Request("http://localhost?refresh=1"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(mockListBuilds).toHaveBeenCalledWith("app-1", true);
    expect(await response.json()).toEqual({ build: { id: "build-1" }, meta: null });

    mockListBuilds.mockRejectedValueOnce(new Error("boom"));
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("PATCH /testflight/builds/[buildId] updates beta localization", async () => {
    const { PATCH } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/route"
    );

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsNew: "New fixes", localizationId: "loc-1" }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    const data = await response.json();

    expect(mockUpdateBetaBuildLocalization).toHaveBeenCalledWith("loc-1", "New fixes");
    expect(data).toEqual({ ok: true });
  });

  it("PATCH /testflight/builds/[buildId] handles demo, missing credentials, invalid payloads, and mapped errors", async () => {
    const { PATCH } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    let response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ whatsNew: "x", localizationId: "loc-1" }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ whatsNew: "x", localizationId: "loc-1" }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No ASC credentials" });

    mockHasCredentials.mockReturnValue(true);
    response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });

    response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsNew: "", localizationId: "" }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    mockUpdateBetaBuildLocalization.mockRejectedValueOnce(new Error("boom"));
    response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsNew: "x", localizationId: "loc-1" }),
      }),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("build action routes call their corresponding mutation", async () => {
    const expire = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/expire/route"
    );
    const notify = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/notify-testers/route"
    );
    const review = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/submit-for-review/route"
    );
    const compliance = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/export-compliance/route"
    );

    mockNotifyTesters.mockResolvedValue({ autoNotified: true });

    expect(
      await (await expire.POST(new Request("http://localhost"), {
        params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
      })).json(),
    ).toEqual({ ok: true });
    expect(mockExpireBuild).toHaveBeenCalledWith("build-1");

    expect(
      await (await notify.POST(new Request("http://localhost"), {
        params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
      })).json(),
    ).toEqual({ ok: true, autoNotified: true });

    expect(
      await (await review.POST(new Request("http://localhost"), {
        params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
      })).json(),
    ).toEqual({ ok: true });
    expect(mockSubmitForBetaReview).toHaveBeenCalledWith("build-1");

    expect(
      await (await compliance.POST(new Request("http://localhost"), {
        params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
      })).json(),
    ).toEqual({ ok: true });
    expect(mockDeclareExportCompliance).toHaveBeenCalledWith("build-1", false);
  });

  it("build action routes handle demo, missing credentials, and mapped errors", async () => {
    const expire = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/expire/route"
    );
    const notify = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/notify-testers/route"
    );
    const review = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/submit-for-review/route"
    );
    const compliance = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/export-compliance/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    let response = await expire.POST(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });

    response = await notify.POST(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await review.POST(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });

    response = await compliance.POST(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });

    mockHasCredentials.mockReturnValue(true);
    mockExpireBuild.mockRejectedValueOnce(new Error("boom"));
    response = await expire.POST(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });

    mockNotifyTesters.mockRejectedValueOnce(new Error("boom"));
    response = await notify.POST(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });

    mockSubmitForBetaReview.mockRejectedValueOnce(new Error("boom"));
    response = await review.POST(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });

    mockDeclareExportCompliance.mockRejectedValueOnce(new Error("boom"));
    response = await compliance.POST(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("GET /testflight/feedback returns feedback with completedIds", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/feedback/route"
    );

    mockGetCompletedFeedbackIds.mockReturnValue(["fb-1"]);
    mockListFeedback.mockResolvedValue([{ id: "fb-2" }]);
    mockCacheGetMeta.mockReturnValue({ fetchedAt: 1 });

    const response = await GET(new Request("http://localhost?refresh=1"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    const data = await response.json();

    expect(mockListFeedback).toHaveBeenCalledWith("app-1", true);
    expect(data).toEqual({
      feedback: [{ id: "fb-2" }],
      completedIds: ["fb-1"],
      meta: { fetchedAt: 1 },
    });
  });

  it("DELETE /testflight/feedback deletes the requested item", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/testflight/feedback/route"
    );

    const response = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "fb-1", type: "crash" }),
      }),
    );
    const data = await response.json();

    expect(mockDeleteFeedbackItem).toHaveBeenCalledWith("fb-1", "crash");
    expect(data).toEqual({ ok: true });
  });

  it("GET /testflight/feedback/[feedbackId]/crash-log returns 404 when missing", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/feedback/[feedbackId]/crash-log/route"
    );

    mockGetFeedbackCrashLog.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ feedbackId: "fb-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Crash log not found");
  });

  it("GET /testflight/pre-release-versions returns versions and meta", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/pre-release-versions/route"
    );

    mockListPreReleaseVersions.mockResolvedValue([{ id: "v1" }]);
    mockCacheGetMeta.mockReturnValue({ fetchedAt: 1 });

    const response = await GET(new Request("http://localhost?refresh=1"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    const data = await response.json();

    expect(data).toEqual({ versions: [{ id: "v1" }], meta: { fetchedAt: 1 } });
  });

  it("PATCH /testflight/info updates localization, review detail, and license", async () => {
    const { PATCH } = await import(
      "@/app/api/apps/[appId]/testflight/info/route"
    );

    await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateLocalization",
          localizationId: "loc-1",
          fields: { description: "Hello" },
        }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(mockUpdateBetaAppLocalization).toHaveBeenCalledWith("loc-1", {
      description: "Hello",
    });

    await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateReviewDetail",
          detailId: "detail-1",
          fields: { contactEmail: "a@example.com" },
        }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(mockUpdateBetaAppReviewDetail).toHaveBeenCalledWith("detail-1", {
      contactEmail: "a@example.com",
    });

    await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateLicense",
          agreementId: "agr-1",
          agreementText: "terms",
        }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(mockUpdateBetaLicenseAgreement).toHaveBeenCalledWith("agr-1", "terms");
  });

  it("GET /testflight/info handles demo, missing credentials, success, and mapped errors", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/info/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoTFInfo.mockReturnValue({ localizations: [] });
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ info: { localizations: [] }, meta: null });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ info: null, meta: null });

    mockHasCredentials.mockReturnValue(true);
    mockGetBetaAppInfo.mockResolvedValue({ id: "beta-info-1" });
    mockCacheGetMeta.mockReturnValue({ fetchedAt: 1 });
    response = await GET(new Request("http://localhost?refresh=1"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(mockGetBetaAppInfo).toHaveBeenCalledWith("app-1", true);
    expect(await response.json()).toEqual({
      info: { id: "beta-info-1" },
      meta: { fetchedAt: 1 },
    });

    mockGetBetaAppInfo.mockRejectedValueOnce(new Error("boom"));
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("PATCH /testflight/info validates JSON, schema, demo, no-credentials, and mapped errors", async () => {
    const { PATCH } = await import(
      "@/app/api/apps/[appId]/testflight/info/route"
    );

    let response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });

    response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateLocalization", localizationId: "", fields: {} }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Validation failed");

    mockIsDemoMode.mockReturnValue(true);
    response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateLicense",
          agreementId: "agr-1",
          agreementText: "terms",
        }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateLicense",
          agreementId: "agr-1",
          agreementText: "terms",
        }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No ASC credentials" });

    mockHasCredentials.mockReturnValue(true);
    mockUpdateBetaLicenseAgreement.mockRejectedValueOnce(new Error("failed"));
    response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateLicense",
          agreementId: "agr-1",
          agreementText: "terms",
        }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("PUT /testflight/info delegates to syncLocalizations", async () => {
    const { PUT } = await import(
      "@/app/api/apps/[appId]/testflight/info/route"
    );

    mockSyncLocalizations.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const request = new Request("http://localhost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locales: {}, originalLocaleIds: {} }),
    });
    const response = await PUT(request, {
      params: Promise.resolve({ appId: "app-1" }),
    });
    const data = await response.json();

    expect(mockSyncLocalizations).toHaveBeenCalled();
    expect(data).toEqual({ ok: true });
  });

  it("PUT /testflight/info handles demo, missing credentials, and sync failures", async () => {
    const { PUT } = await import(
      "@/app/api/apps/[appId]/testflight/info/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    let response = await PUT(new Request("http://localhost", { method: "PUT" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ ok: true, results: [] });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await PUT(new Request("http://localhost", { method: "PUT" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No ASC credentials" });

    mockHasCredentials.mockReturnValue(true);
    mockSyncLocalizations.mockRejectedValueOnce(new Error("sync failed"));
    response = await PUT(new Request("http://localhost", { method: "PUT" }), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("build action routes cover remaining no-credentials and demo branches", async () => {
    const expire = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/expire/route"
    );
    const notify = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/notify-testers/route"
    );
    const review = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/submit-for-review/route"
    );
    const compliance = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/export-compliance/route"
    );

    // expire: no-credentials branch (line 18)
    mockHasCredentials.mockReturnValue(false);
    let response = await expire.POST(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });
    expect(mockExpireBuild).not.toHaveBeenCalled();

    // notify-testers: no-credentials branch (line 18)
    response = await notify.POST(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });
    expect(mockNotifyTesters).not.toHaveBeenCalled();

    // submit-for-review: demo branch (line 14)
    mockHasCredentials.mockReturnValue(true);
    mockIsDemoMode.mockReturnValue(true);
    response = await review.POST(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });
    expect(mockSubmitForBetaReview).not.toHaveBeenCalled();

    // export-compliance: demo branch (line 14)
    response = await compliance.POST(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ ok: true });
    expect(mockDeclareExportCompliance).not.toHaveBeenCalled();
  });

  it("GET /testflight/feedback covers demo and no-credentials branches", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/feedback/route"
    );

    // demo branch (line 20)
    mockIsDemoMode.mockReturnValue(true);
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ feedback: [], completedIds: [], meta: null });

    // no-credentials branch (line 24)
    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ feedback: [], completedIds: [], meta: null });

    // error branch (line 32)
    mockHasCredentials.mockReturnValue(true);
    mockListFeedback.mockRejectedValueOnce(new Error("boom"));
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("DELETE /testflight/feedback covers demo and error branches", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/testflight/feedback/route"
    );

    // demo branch (line 40)
    mockIsDemoMode.mockReturnValue(true);
    let response = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "fb-1", type: "crash" }),
      }),
    );
    expect(await response.json()).toEqual({ ok: true });
    expect(mockDeleteFeedbackItem).not.toHaveBeenCalled();

    // error branch (line 49)
    mockIsDemoMode.mockReturnValue(false);
    mockDeleteFeedbackItem.mockRejectedValueOnce(new Error("boom"));
    response = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "fb-1", type: "crash" }),
      }),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("GET /testflight/feedback/[feedbackId]/crash-log returns data on success and maps errors", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/feedback/[feedbackId]/crash-log/route"
    );

    // success branch (line 16)
    mockGetFeedbackCrashLog.mockResolvedValue({ log: "stack trace" });
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ feedbackId: "fb-1" }),
    });
    expect(await response.json()).toEqual({ log: "stack trace" });

    // error branch (lines 17-18)
    mockGetFeedbackCrashLog.mockRejectedValueOnce(new Error("boom"));
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ feedbackId: "fb-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("GET /testflight/pre-release-versions covers demo, no-credentials, and error branches", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/pre-release-versions/route"
    );

    // demo branch (line 17)
    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoPreReleaseVersions.mockReturnValue([{ id: "demo-v1" }]);
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({
      versions: [{ id: "demo-v1" }],
      meta: null,
    });

    // no-credentials branch (line 21)
    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(await response.json()).toEqual({ versions: [], meta: null });

    // error branch (line 29)
    mockHasCredentials.mockReturnValue(true);
    mockListPreReleaseVersions.mockRejectedValueOnce(new Error("boom"));
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("PUT /testflight/info exercises the syncLocalizations callback wiring", async () => {
    const { PUT } = await import(
      "@/app/api/apps/[appId]/testflight/info/route"
    );

    // Set up syncLocalizations to capture and invoke all callbacks
    mockSyncLocalizations.mockImplementation(async (_req: Request, _appId: string, ops: {
      update: (id: string, fields: Record<string, string>) => Promise<void>;
      create: (...args: unknown[]) => Promise<void>;
      delete: (id: string) => Promise<void>;
      invalidateCache: () => void;
    }) => {
      // Exercise each callback to cover lines 141-145
      await ops.update("loc-1", { description: "test" });
      await ops.create("app-1", "en-US", { description: "new" });
      await ops.delete("loc-2");
      ops.invalidateCache();
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locales: {}, originalLocaleIds: {} }),
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    // Verify the callbacks were wired to the correct functions
    expect(mockUpdateBetaAppLocalization).toHaveBeenCalledWith("loc-1", { description: "test" });
    expect(mockCreateBetaAppLocalization).toHaveBeenCalledWith("app-1", "en-US", { description: "new" });
    expect(mockDeleteBetaAppLocalization).toHaveBeenCalledWith("loc-2");
  });
});
