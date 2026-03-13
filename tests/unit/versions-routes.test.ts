import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListVersions = vi.fn();
const mockCreateVersion = vi.fn();
const mockUpdateVersionAttributes = vi.fn();
const mockSelectBuildForVersion = vi.fn();
const mockDeleteVersion = vi.fn();
const mockInvalidateVersionsCache = vi.fn();
const mockHasCredentials = vi.fn();
const mockCacheGetMeta = vi.fn();
const mockErrorJson = vi.fn();
const mockIsDemoMode = vi.fn();
const mockGetDemoVersions = vi.fn();

vi.mock("@/lib/asc/versions", () => ({
  listVersions: (...args: unknown[]) => mockListVersions(...args),
}));

vi.mock("@/lib/asc/version-mutations", () => ({
  createVersion: (...args: unknown[]) => mockCreateVersion(...args),
  updateVersionAttributes: (...args: unknown[]) =>
    mockUpdateVersionAttributes(...args),
  selectBuildForVersion: (...args: unknown[]) => mockSelectBuildForVersion(...args),
  deleteVersion: (...args: unknown[]) => mockDeleteVersion(...args),
  invalidateVersionsCache: (...args: unknown[]) =>
    mockInvalidateVersionsCache(...args),
}));

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));

vi.mock("@/lib/cache", () => ({
  cacheGetMeta: (...args: unknown[]) => mockCacheGetMeta(...args),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
  getDemoVersions: (...args: unknown[]) => mockGetDemoVersions(...args),
}));

function makeParams(appId = "app-1", versionId = "ver-1") {
  return Promise.resolve({ appId, versionId });
}

function makeJsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("version routes", () => {
  beforeEach(() => {
    mockListVersions.mockReset();
    mockCreateVersion.mockReset();
    mockUpdateVersionAttributes.mockReset();
    mockSelectBuildForVersion.mockReset();
    mockDeleteVersion.mockReset();
    mockInvalidateVersionsCache.mockReset();
    mockHasCredentials.mockReturnValue(true);
    mockCacheGetMeta.mockReturnValue(null);
    mockErrorJson.mockImplementation(
      () => new Response(JSON.stringify({ error: "mapped" }), { status: 502 }),
    );
    mockIsDemoMode.mockReturnValue(false);
    mockGetDemoVersions.mockReturnValue([{ id: "demo-version" }]);
  });

  it("GET /versions returns demo data in demo mode", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/versions/route");

    mockIsDemoMode.mockReturnValue(true);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-7" }),
    });
    const data = await response.json();

    expect(data).toEqual({ versions: [{ id: "demo-version" }], meta: null });
    expect(mockGetDemoVersions).toHaveBeenCalledWith("app-7");
  });

  it("GET /versions returns cached metadata with fetched versions", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/versions/route");

    mockListVersions.mockResolvedValue([{ id: "ver-1" }]);
    mockCacheGetMeta.mockReturnValue({ updatedAt: "now" });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    const data = await response.json();

    expect(data).toEqual({
      versions: [{ id: "ver-1" }],
      meta: { updatedAt: "now" },
    });
  });

  it("POST /versions rejects invalid JSON bodies", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/route");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid JSON body");
  });

  it("POST /versions updates the existing editable version instead of creating one", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/route");

    mockListVersions.mockResolvedValue([
      {
        id: "ver-editable",
        attributes: {
          platform: "IOS",
          appVersionState: "PREPARE_FOR_SUBMISSION",
        },
      },
    ]);

    const response = await POST(
      makeJsonRequest("http://localhost", "POST", {
        versionString: "1.2.3",
        platform: "IOS",
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, versionId: "ver-editable" });
    expect(mockUpdateVersionAttributes).toHaveBeenCalledWith("ver-editable", {
      versionString: "1.2.3",
    });
    expect(mockCreateVersion).not.toHaveBeenCalled();
    expect(mockInvalidateVersionsCache).toHaveBeenCalledWith("app-1");
  });

  it("POST /versions creates a new version when there is no editable match", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/route");

    mockListVersions.mockResolvedValue([]);
    mockCreateVersion.mockResolvedValue("ver-new");

    const response = await POST(
      makeJsonRequest("http://localhost", "POST", {
        versionString: "2.0.0",
        platform: "IOS",
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({ ok: true, versionId: "ver-new" });
    expect(mockCreateVersion).toHaveBeenCalledWith("app-1", "2.0.0", "IOS");
  });

  it("PATCH /versions/[versionId] rejects empty updates", async () => {
    const { PATCH } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/route"
    );

    const response = await PATCH(
      makeJsonRequest("http://localhost", "PATCH", {}),
      { params: makeParams() },
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Validation failed");
  });

  it("PATCH /versions/[versionId] updates attributes and selected build", async () => {
    const { PATCH } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/route"
    );

    const response = await PATCH(
      makeJsonRequest("http://localhost", "PATCH", {
        versionString: "3.0.0",
        buildId: "build-9",
        copyright: "2026 Example",
      }),
      { params: makeParams("app-42", "ver-9") },
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true });
    expect(mockUpdateVersionAttributes).toHaveBeenCalledWith("ver-9", {
      versionString: "3.0.0",
      copyright: "2026 Example",
    });
    expect(mockSelectBuildForVersion).toHaveBeenCalledWith("ver-9", "build-9");
    expect(mockInvalidateVersionsCache).toHaveBeenCalledWith("app-42");
  });

  it("DELETE /versions/[versionId] returns 401 without credentials", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/route"
    );

    mockHasCredentials.mockReturnValue(false);

    const response = await DELETE(new Request("http://localhost"), {
      params: makeParams(),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("No credentials");
  });

  it("DELETE /versions/[versionId] deletes and invalidates cache", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/route"
    );

    const response = await DELETE(new Request("http://localhost"), {
      params: makeParams("app-2", "ver-3"),
    });
    const data = await response.json();

    expect(data).toEqual({ ok: true });
    expect(mockDeleteVersion).toHaveBeenCalledWith("ver-3");
    expect(mockInvalidateVersionsCache).toHaveBeenCalledWith("app-2");
  });

  it("GET /versions returns empty data without credentials", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/versions/route");
    mockHasCredentials.mockReturnValue(false);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    const data = await response.json();

    expect(data).toEqual({ versions: [], meta: null });
  });

  it("GET /versions maps fetch failures through errorJson", async () => {
    const { GET } = await import("@/app/api/apps/[appId]/versions/route");
    mockListVersions.mockRejectedValue(new Error("boom"));

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ appId: "app-1" }),
    });
    const data = await response.json();

    expect(data).toEqual({ error: "mapped" });
    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error));
  });

  it("POST /versions returns demo response in demo mode", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/route");
    mockIsDemoMode.mockReturnValue(true);

    const response = await POST(
      makeJsonRequest("http://localhost", "POST", {
        versionString: "1.0.0",
        platform: "IOS",
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true, versionId: "demo" });
  });

  it("POST /versions rejects missing credentials", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/route");
    mockHasCredentials.mockReturnValue(false);

    const response = await POST(
      makeJsonRequest("http://localhost", "POST", {
        versionString: "1.0.0",
        platform: "IOS",
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "No ASC credentials" });
  });

  it("POST /versions maps create failures through errorJson", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/versions/route");
    mockListVersions.mockRejectedValue(new Error("create failed"));

    const response = await POST(
      makeJsonRequest("http://localhost", "POST", {
        versionString: "1.0.0",
        platform: "IOS",
      }),
      { params: Promise.resolve({ appId: "app-1" }) },
    );
    const data = await response.json();

    expect(data).toEqual({ error: "mapped" });
    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error));
  });

  it("PATCH /versions/[versionId] returns demo response in demo mode", async () => {
    const { PATCH } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/route"
    );
    mockIsDemoMode.mockReturnValue(true);

    const response = await PATCH(
      makeJsonRequest("http://localhost", "PATCH", { versionString: "2.0" }),
      { params: makeParams() },
    );
    const data = await response.json();

    expect(data).toEqual({ ok: true });
  });

  it("PATCH /versions/[versionId] rejects missing credentials", async () => {
    const { PATCH } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/route"
    );
    mockHasCredentials.mockReturnValue(false);

    const response = await PATCH(
      makeJsonRequest("http://localhost", "PATCH", { versionString: "2.0" }),
      { params: makeParams() },
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "No ASC credentials" });
  });

  it("PATCH /versions/[versionId] maps update failures through errorJson", async () => {
    const { PATCH } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/route"
    );
    mockUpdateVersionAttributes.mockRejectedValue(new Error("update failed"));

    const response = await PATCH(
      makeJsonRequest("http://localhost", "PATCH", { versionString: "2.0" }),
      { params: makeParams() },
    );
    const data = await response.json();

    expect(data).toEqual({ error: "mapped" });
    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error));
  });

  it("DELETE /versions/[versionId] returns demo response in demo mode", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/route"
    );
    mockIsDemoMode.mockReturnValue(true);

    const response = await DELETE(new Request("http://localhost"), {
      params: makeParams(),
    });
    const data = await response.json();

    expect(data).toEqual({ ok: true });
  });

  it("DELETE /versions/[versionId] maps delete failures through errorJson", async () => {
    const { DELETE } = await import(
      "@/app/api/apps/[appId]/versions/[versionId]/route"
    );
    mockDeleteVersion.mockRejectedValue(new Error("delete failed"));

    const response = await DELETE(new Request("http://localhost"), {
      params: makeParams("app-1", "ver-1"),
    });
    const data = await response.json();

    expect(data).toEqual({ error: "mapped" });
    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error), 500);
  });
});
