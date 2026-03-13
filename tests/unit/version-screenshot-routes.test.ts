import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHasCredentials = vi.fn();
const mockIsDemoMode = vi.fn();
const mockGetDemoVersionLocalizations = vi.fn();
const mockCacheGetMeta = vi.fn();
const mockListLocalizations = vi.fn();
const mockSyncLocalizations = vi.fn();
const mockErrorJson = vi.fn();
const mockUpdateVersionAttributes = vi.fn();
const mockEnablePhasedRelease = vi.fn();
const mockDisablePhasedRelease = vi.fn();
const mockInvalidateVersionsCache = vi.fn();
const mockListScreenshotSets = vi.fn();
const mockUploadScreenshot = vi.fn();
const mockInvalidateScreenshotCache = vi.fn();
const mockDeleteScreenshot = vi.fn();
const mockReorderScreenshots = vi.fn();
const mockCreateScreenshotSet = vi.fn();
const mockDeleteScreenshotSet = vi.fn();
const mockListDiagnosticSignatures = vi.fn();
const mockGetDiagnosticLogs = vi.fn();
const mockCancelSubmission = vi.fn();
const mockCancelUnresolvedSubmission = vi.fn();
const mockUpdateVersionLocalization = vi.fn();
const mockCreateVersionLocalization = vi.fn();
const mockDeleteVersionLocalization = vi.fn();
const mockInvalidateLocalizationsCache = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));

vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
  getDemoVersionLocalizations: (...args: unknown[]) => mockGetDemoVersionLocalizations(...args),
}));

vi.mock("@/lib/cache", () => ({
  cacheGetMeta: (...args: unknown[]) => mockCacheGetMeta(...args),
}));

vi.mock("@/lib/asc/localizations", () => ({
  listLocalizations: (...args: unknown[]) => mockListLocalizations(...args),
}));

vi.mock("@/lib/asc/version-mutations", () => ({
  updateVersionAttributes: (...args: unknown[]) => mockUpdateVersionAttributes(...args),
  enablePhasedRelease: (...args: unknown[]) => mockEnablePhasedRelease(...args),
  disablePhasedRelease: (...args: unknown[]) => mockDisablePhasedRelease(...args),
  invalidateVersionsCache: (...args: unknown[]) => mockInvalidateVersionsCache(...args),
  cancelSubmission: (...args: unknown[]) => mockCancelSubmission(...args),
  cancelUnresolvedSubmission: (...args: unknown[]) => mockCancelUnresolvedSubmission(...args),
}));

vi.mock("@/lib/asc/localization-mutations", () => ({
  updateVersionLocalization: (...args: unknown[]) => mockUpdateVersionLocalization(...args),
  createVersionLocalization: (...args: unknown[]) => mockCreateVersionLocalization(...args),
  deleteVersionLocalization: (...args: unknown[]) => mockDeleteVersionLocalization(...args),
  invalidateLocalizationsCache: (...args: unknown[]) => mockInvalidateLocalizationsCache(...args),
}));

vi.mock("@/lib/asc/screenshot-mutations", () => ({
  uploadScreenshot: (...args: unknown[]) => mockUploadScreenshot(...args),
  invalidateScreenshotCache: (...args: unknown[]) => mockInvalidateScreenshotCache(...args),
  deleteScreenshot: (...args: unknown[]) => mockDeleteScreenshot(...args),
  reorderScreenshots: (...args: unknown[]) => mockReorderScreenshots(...args),
  createScreenshotSet: (...args: unknown[]) => mockCreateScreenshotSet(...args),
  deleteScreenshotSet: (...args: unknown[]) => mockDeleteScreenshotSet(...args),
}));

vi.mock("@/lib/asc/screenshots", () => ({
  listScreenshotSets: (...args: unknown[]) => mockListScreenshotSets(...args),
}));

vi.mock("@/lib/asc/testflight", () => ({
  listDiagnosticSignatures: (...args: unknown[]) => mockListDiagnosticSignatures(...args),
  getDiagnosticLogs: (...args: unknown[]) => mockGetDiagnosticLogs(...args),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    syncLocalizations: (...args: unknown[]) => mockSyncLocalizations(...args),
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

describe("version and screenshot routes", () => {
  beforeEach(() => {
    mockHasCredentials.mockReset();
    mockHasCredentials.mockReturnValue(true);
    mockIsDemoMode.mockReset();
    mockIsDemoMode.mockReturnValue(false);
    mockGetDemoVersionLocalizations.mockReset();
    mockCacheGetMeta.mockReset();
    mockListLocalizations.mockReset();
    mockSyncLocalizations.mockReset();
    mockErrorJson.mockReset();
    mockErrorJson.mockImplementation(
      (_err, status = 500) =>
        new Response(JSON.stringify({ error: "mapped" }), { status: status as number }),
    );
    mockUpdateVersionAttributes.mockReset();
    mockEnablePhasedRelease.mockReset();
    mockDisablePhasedRelease.mockReset();
    mockInvalidateVersionsCache.mockReset();
    mockListScreenshotSets.mockReset();
    mockUploadScreenshot.mockReset();
    mockInvalidateScreenshotCache.mockReset();
    mockDeleteScreenshot.mockReset();
    mockReorderScreenshots.mockReset();
    mockCreateScreenshotSet.mockReset();
    mockDeleteScreenshotSet.mockReset();
    mockListDiagnosticSignatures.mockReset();
    mockGetDiagnosticLogs.mockReset();
    mockCancelSubmission.mockReset();
    mockCancelUnresolvedSubmission.mockReset();
    mockUpdateVersionLocalization.mockReset();
    mockCreateVersionLocalization.mockReset();
    mockDeleteVersionLocalization.mockReset();
    mockInvalidateLocalizationsCache.mockReset();
    vi.resetModules();
  });

  it("GET /versions/[versionId]/localizations returns demo localizations", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/versions/[versionId]/localizations/route");
    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoVersionLocalizations.mockReturnValue([{ id: "loc-1" }]);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });

    expect(await response.json()).toEqual({ localizations: [{ id: "loc-1" }], meta: null });
  });

  it("GET /versions/[versionId]/localizations returns localizations and cache metadata", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/versions/[versionId]/localizations/route");
    mockListLocalizations.mockResolvedValue([{ id: "loc-1" }]);
    mockCacheGetMeta.mockReturnValue({ updatedAt: 1 });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });

    expect(mockListLocalizations).toHaveBeenCalledWith("ver-1");
    expect(await response.json()).toEqual({
      localizations: [{ id: "loc-1" }],
      meta: { updatedAt: 1 },
    });
  });

  it("PUT /versions/[versionId]/localizations delegates to syncLocalizations", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/versions/[versionId]/localizations/route");
    mockSyncLocalizations.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, results: [] }), { status: 200 }),
    );
    const request = new Request("http://localhost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localizations: [] }),
    });

    const response = await PUT(request, {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });

    expect(mockSyncLocalizations).toHaveBeenCalledWith(request, "ver-1", {
      update: expect.any(Function),
      create: expect.any(Function),
      delete: expect.any(Function),
      invalidateCache: expect.any(Function),
    });
    expect(await response.json()).toEqual({ ok: true, results: [] });
  });

  it("GET /versions/[versionId]/localizations returns empty data without credentials and maps errors", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/versions/[versionId]/localizations/route");

    mockHasCredentials.mockReturnValue(false);
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });
    expect(await response.json()).toEqual({ localizations: [], meta: null });

    mockHasCredentials.mockReturnValue(true);
    mockListLocalizations.mockRejectedValueOnce(new Error("boom"));
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("PUT /versions/[versionId]/localizations handles demo, missing credentials, and sync failures", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/versions/[versionId]/localizations/route");

    mockIsDemoMode.mockReturnValue(true);
    let response = await PUT(new Request("http://localhost", { method: "PUT" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });
    expect(await response.json()).toEqual({ ok: true, results: [] });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await PUT(new Request("http://localhost", { method: "PUT" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No credentials" });

    mockHasCredentials.mockReturnValue(true);
    mockSyncLocalizations.mockRejectedValueOnce(new Error("sync failed"));
    response = await PUT(new Request("http://localhost", { method: "PUT" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("PUT /versions/[versionId]/release returns partial errors with 207", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/versions/[versionId]/release/route");
    mockUpdateVersionAttributes.mockRejectedValue(new Error("release type failed"));
    mockEnablePhasedRelease.mockRejectedValue("bad");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releaseType: "AFTER_APPROVAL",
          earliestReleaseDate: null,
          phasedRelease: true,
          phasedReleaseId: null,
        }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(response.status).toBe(207);
    expect(await response.json()).toEqual({
      ok: false,
      errors: ["release type failed", "Failed to update phased release"],
    });
    expect(mockInvalidateVersionsCache).toHaveBeenCalledWith("app-1");
  });

  it("PUT /versions/[versionId]/release disables phased release when an ID is present", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/versions/[versionId]/release/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releaseType: "MANUAL",
          earliestReleaseDate: "2026-03-15",
          phasedRelease: false,
          phasedReleaseId: "phase-1",
        }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(mockUpdateVersionAttributes).toHaveBeenCalledWith("ver-1", {
      releaseType: "MANUAL",
      earliestReleaseDate: "2026-03-15",
    });
    expect(mockDisablePhasedRelease).toHaveBeenCalledWith("phase-1");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("GET /screenshots returns screenshot sets with cache metadata", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/route"
    );
    mockListScreenshotSets.mockResolvedValue([{ id: "set-1" }]);
    mockCacheGetMeta.mockReturnValue({ updatedAt: 2 });

    const response = await GET(new Request("http://localhost?refresh=1"), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }),
    });

    expect(mockListScreenshotSets).toHaveBeenCalledWith("loc-1", true);
    expect(await response.json()).toEqual({
      screenshotSets: [{ id: "set-1" }],
      meta: { updatedAt: 2 },
    });
  });

  it("GET /screenshots returns empty data in demo/no-credentials modes and maps errors", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    let response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }),
    });
    expect(await response.json()).toEqual({ screenshotSets: [], meta: null });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }),
    });
    expect(await response.json()).toEqual({ screenshotSets: [], meta: null });

    mockHasCredentials.mockReturnValue(true);
    mockListScreenshotSets.mockRejectedValueOnce(new Error("boom"));
    response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }),
    });
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("POST /screenshots uploads a screenshot and invalidates cache", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/route"
    );
    mockUploadScreenshot.mockResolvedValue({ id: "shot-1" });
    const formData = new FormData();
    formData.set("setId", "set-1");
    formData.set("file", new File(["abc"], "shot.png", { type: "image/png" }));

    const response = await POST(
      new Request("http://localhost", { method: "POST", body: formData }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );

    expect(mockUploadScreenshot).toHaveBeenCalledWith(
      "set-1",
      "shot.png",
      expect.any(Buffer),
    );
    expect(mockInvalidateScreenshotCache).toHaveBeenCalledWith("loc-1");
    expect(await response.json()).toEqual({ screenshot: { id: "shot-1" } });
  });

  it("POST /screenshots validates missing file or setId", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/route"
    );
    const formData = new FormData();

    const response = await POST(
      new Request("http://localhost", { method: "POST", body: formData }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing file or setId" });
  });

  it("POST /screenshots rejects missing credentials and maps upload errors", async () => {
    const { POST } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/route"
    );

    mockHasCredentials.mockReturnValue(false);
    let response = await POST(
      new Request("http://localhost", { method: "POST", body: new FormData() }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No ASC credentials configured" });

    mockHasCredentials.mockReturnValue(true);
    const formData = new FormData();
    formData.set("setId", "set-1");
    formData.set("file", new File(["abc"], "shot.png", { type: "image/png" }));
    mockUploadScreenshot.mockRejectedValueOnce(new Error("upload failed"));
    response = await POST(
      new Request("http://localhost", { method: "POST", body: formData }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("DELETE /screenshots/[screenshotId] removes a screenshot", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/[screenshotId]/route"
    );

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({
        appId: "app-1",
        versionId: "ver-1",
        localizationId: "loc-1",
        screenshotId: "shot-1",
      }),
    });

    expect(mockDeleteScreenshot).toHaveBeenCalledWith("shot-1");
    expect(mockInvalidateScreenshotCache).toHaveBeenCalledWith("loc-1");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("DELETE /screenshots/[screenshotId] handles demo, missing credentials, and mapped errors", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/[screenshotId]/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    let response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({
        appId: "app-1",
        versionId: "ver-1",
        localizationId: "loc-1",
        screenshotId: "shot-1",
      }),
    });
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({
        appId: "app-1",
        versionId: "ver-1",
        localizationId: "loc-1",
        screenshotId: "shot-1",
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No ASC credentials configured" });

    mockHasCredentials.mockReturnValue(true);
    mockDeleteScreenshot.mockRejectedValueOnce(new Error("delete failed"));
    response = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({
        appId: "app-1",
        versionId: "ver-1",
        localizationId: "loc-1",
        screenshotId: "shot-1",
      }),
    });
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("PATCH /screenshots/reorder validates payload shape", async () => {
    const { PATCH } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/reorder/route"
    );

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId: "set-1" }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing setId or screenshotIds" });
  });

  it("PATCH /screenshots/reorder reorders screenshots and invalidates cache", async () => {
    const { PATCH } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/reorder/route"
    );

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId: "set-1", screenshotIds: ["a", "b"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );

    expect(mockReorderScreenshots).toHaveBeenCalledWith("set-1", ["a", "b"]);
    expect(mockInvalidateScreenshotCache).toHaveBeenCalledWith("loc-1");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("PATCH /screenshots/reorder handles demo, missing credentials, and mapped errors", async () => {
    const { PATCH } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/reorder/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    let response = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({}) }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({}) }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No ASC credentials configured" });

    mockHasCredentials.mockReturnValue(true);
    mockReorderScreenshots.mockRejectedValueOnce(new Error("reorder failed"));
    response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId: "set-1", screenshotIds: ["a"] }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("POST /screenshots/sets validates and creates a screenshot set", async () => {
    const route = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/sets/route"
    );
    mockCreateScreenshotSet.mockResolvedValue("set-1");

    const missing = await route.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );

    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "Missing displayType" });

    const response = await route.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayType: "APP_IPHONE_67" }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );

    expect(mockCreateScreenshotSet).toHaveBeenCalledWith("loc-1", "APP_IPHONE_67");
    expect(mockInvalidateScreenshotCache).toHaveBeenCalledWith("loc-1");
    expect(await response.json()).toEqual({ setId: "set-1" });
  });

  it("DELETE /screenshots/sets validates and deletes a screenshot set", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/sets/route"
    );

    const missing = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );

    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "Missing setId" });

    const response = await DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId: "set-1" }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );

    expect(mockDeleteScreenshotSet).toHaveBeenCalledWith("set-1");
    expect(mockInvalidateScreenshotCache).toHaveBeenCalledWith("loc-1");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("screenshots/sets handles demo, missing credentials, and mapped failures", async () => {
    const route = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/localizations/[localizationId]/screenshots/sets/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    let response = await route.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ displayType: "APP_IPHONE_67" }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    response = await route.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        body: JSON.stringify({ setId: "set-1" }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );
    expect(await response.json()).toEqual({ ok: true });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await route.POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No credentials" });

    response = await route.DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No credentials" });

    mockHasCredentials.mockReturnValue(true);
    mockCreateScreenshotSet.mockRejectedValueOnce(new Error("boom"));
    response = await route.POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayType: "APP_IPHONE_67" }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "mapped" });

    mockDeleteScreenshotSet.mockRejectedValueOnce(new Error("boom"));
    response = await route.DELETE(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId: "set-1" }),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1", localizationId: "loc-1" }) },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("GET /diagnostics filters diagnostic signatures by valid type", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/diagnostics/route"
    );
    mockListDiagnosticSignatures.mockResolvedValue([{ id: "sig-1" }]);

    const response = await GET(
      new Request("http://localhost?refresh=1&type=HANGS"),
      { params: Promise.resolve({ appId: "app-1", buildId: "build-1" }) },
    );

    expect(mockListDiagnosticSignatures).toHaveBeenCalledWith("build-1", "HANGS", true);
    expect(await response.json()).toEqual({ signatures: [{ id: "sig-1" }] });
  });

  it("GET /diagnostics/[signatureId]/logs returns diagnostic logs", async () => {
    const { GET } = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/diagnostics/[signatureId]/logs/route"
    );
    mockGetDiagnosticLogs.mockResolvedValue([{ id: "log-1" }]);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1", signatureId: "sig-1" }),
    });

    expect(mockGetDiagnosticLogs).toHaveBeenCalledWith("sig-1");
    expect(await response.json()).toEqual({ logs: [{ id: "log-1" }] });
  });

  it("diagnostic routes handle demo, missing credentials, invalid types, and mapped errors", async () => {
    const diagnostics = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/diagnostics/route"
    );
    const logs = await import(
      "@/app/api/apps/[appId]/testflight/builds/[buildId]/diagnostics/[signatureId]/logs/route"
    );

    mockIsDemoMode.mockReturnValue(true);
    let response = await diagnostics.GET(new Request("http://localhost?type=INVALID"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ signatures: [] });

    response = await logs.GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1", signatureId: "sig-1" }),
    });
    expect(await response.json()).toEqual({ logs: [] });

    mockIsDemoMode.mockReturnValue(false);
    mockHasCredentials.mockReturnValue(false);
    response = await diagnostics.GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(await response.json()).toEqual({ signatures: [] });

    response = await logs.GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1", signatureId: "sig-1" }),
    });
    expect(await response.json()).toEqual({ logs: [] });

    mockHasCredentials.mockReturnValue(true);
    mockListDiagnosticSignatures.mockResolvedValueOnce([{ id: "sig-2" }]);
    response = await diagnostics.GET(new Request("http://localhost?type=INVALID"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(mockListDiagnosticSignatures).toHaveBeenCalledWith("build-1", undefined, false);
    expect(await response.json()).toEqual({ signatures: [{ id: "sig-2" }] });

    mockListDiagnosticSignatures.mockRejectedValueOnce(new Error("boom"));
    response = await diagnostics.GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1" }),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "mapped" });

    mockGetDiagnosticLogs.mockRejectedValueOnce(new Error("boom"));
    response = await logs.GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1", buildId: "build-1", signatureId: "sig-1" }),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "mapped" });
  });

  it("POST /cancel-submission returns demo response in demo mode", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/[versionId]/cancel-submission/route");
    mockIsDemoMode.mockReturnValue(true);

    const response = await POST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(mockCancelSubmission).not.toHaveBeenCalled();
  });

  it("POST /cancel-submission rejects missing credentials", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/[versionId]/cancel-submission/route");
    mockHasCredentials.mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No credentials" });
  });

  it("POST /cancel-submission maps failures through errorJson", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/[versionId]/cancel-submission/route");
    mockCancelSubmission.mockRejectedValue(new Error("cancel failed"));

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(await response.json()).toEqual({ error: "mapped" });
    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error), 500);
  });

  it("PUT /release returns demo response in demo mode", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/versions/[versionId]/release/route");
    mockIsDemoMode.mockReturnValue(true);

    const response = await PUT(
      new Request("http://localhost", { method: "PUT" }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(mockUpdateVersionAttributes).not.toHaveBeenCalled();
  });

  it("PUT /release rejects missing credentials", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/versions/[versionId]/release/route");
    mockHasCredentials.mockReturnValue(false);

    const response = await PUT(
      new Request("http://localhost", { method: "PUT" }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "No credentials" });
  });

  it("PUT /release maps top-level JSON parse failures through errorJson", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/versions/[versionId]/release/route");

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{invalid",
      }),
      { params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }) },
    );

    expect(await response.json()).toEqual({ error: "mapped" });
    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error), 500);
  });

  it("PUT /localizations invokes invalidateCache callback via syncLocalizations", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/versions/[versionId]/localizations/route");
    mockSyncLocalizations.mockImplementation(
      async (_req: unknown, _id: unknown, ops: { invalidateCache: () => void }) => {
        ops.invalidateCache();
        return new Response(JSON.stringify({ ok: true, results: [] }), { status: 200 });
      },
    );

    const request = new Request("http://localhost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localizations: [] }),
    });

    await PUT(request, {
      params: Promise.resolve({ appId: "app-1", versionId: "ver-1" }),
    });

    expect(mockInvalidateLocalizationsCache).toHaveBeenCalledWith("ver-1");
  });
});
