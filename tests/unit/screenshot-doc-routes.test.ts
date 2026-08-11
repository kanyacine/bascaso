import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGetOrCreate = vi.fn();
const mockSave = vi.fn();
const mockSnapshot = vi.fn();
const mockList = vi.fn();
const mockGetVersion = vi.fn();
const mockRestore = vi.fn();
const mockDuplicate = vi.fn();
const mockDelete = vi.fn();
const mockExists = vi.fn();
vi.mock("@/lib/screenshot-docs", () => ({
  currentDocExists: (...a: unknown[]) => mockExists(...a),
  getOrCreateCurrentDoc: (...a: unknown[]) => mockGetOrCreate(...a),
  saveCurrentDoc: (...a: unknown[]) => mockSave(...a),
  saveVersionSnapshot: (...a: unknown[]) => mockSnapshot(...a),
  listVersionSnapshots: (...a: unknown[]) => mockList(...a),
  getVersionSnapshot: (...a: unknown[]) => mockGetVersion(...a),
  restoreVersionSnapshot: (...a: unknown[]) => mockRestore(...a),
  duplicateVersionSnapshot: (...a: unknown[]) => mockDuplicate(...a),
  deleteVersionSnapshot: (...a: unknown[]) => mockDelete(...a),
}));

const mockApps = vi.fn();
const mockVersions = vi.fn();
const mockLocalizations = vi.fn();
const mockSets = vi.fn();
vi.mock("@/lib/asc/apps", () => ({ listApps: () => mockApps() }));
vi.mock("@/lib/asc/versions", () => ({ listVersions: (...a: unknown[]) => mockVersions(...a) }));
vi.mock("@/lib/asc/localizations", () => ({ listLocalizations: (...a: unknown[]) => mockLocalizations(...a) }));
vi.mock("@/lib/asc/screenshots", () => ({ listScreenshotSets: (...a: unknown[]) => mockSets(...a) }));

function ascWithSets(displayTypes: string[]) {
  mockApps.mockResolvedValue([{ id: "app-1", attributes: { primaryLocale: "fr-FR" } }]);
  mockVersions.mockResolvedValue([
    { id: "v1", attributes: { appVersionState: "PREPARE_FOR_SUBMISSION", platform: "IOS" } },
  ]);
  mockLocalizations.mockResolvedValue([
    { id: "loc-en", attributes: { locale: "en-US" } },
    { id: "loc-fr", attributes: { locale: "fr-FR" } },
  ]);
  mockSets.mockResolvedValue(
    displayTypes.map((t) => ({ id: `set-${t}`, attributes: { screenshotDisplayType: t }, screenshots: [{ id: "s1" }] })),
  );
}

beforeEach(() => { vi.clearAllMocks(); });

const params = { params: Promise.resolve({ appId: "app-1" }) };

describe("GET /api/apps/[appId]/screenshot-doc", () => {
  it("returns an existing doc without probing App Store Connect", async () => {
    mockExists.mockReturnValue(true);
    mockGetOrCreate.mockReturnValue({ id: "01A", doc: { screenshots: [] }, updatedAt: "2026-08-10T00:00:00.000Z" });
    const { GET } = await import("@/app/api/apps/[appId]/screenshot-doc/route");
    const res = await GET(new Request("http://localhost"), params);
    expect(mockGetOrCreate).toHaveBeenCalledWith("app-1", undefined);
    expect(mockVersions).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ id: "01A", doc: { screenshots: [] }, updatedAt: "2026-08-10T00:00:00.000Z" });
  });

  it("seeds a new doc from the primary locale's shipped display types, editor formats only", async () => {
    mockExists.mockReturnValue(false);
    // iMessage sets are the only shipped display types the editor cannot render.
    ascWithSets(["APP_IPAD_PRO_3GEN_11", "IMESSAGE_APP_IPHONE_67", "APP_IPHONE_67", "APP_WATCH_ULTRA"]);
    mockGetOrCreate.mockReturnValue({ id: "01A", doc: {}, updatedAt: "t" });
    const { GET } = await import("@/app/api/apps/[appId]/screenshot-doc/route");
    await GET(new Request("http://localhost"), params);
    expect(mockSets).toHaveBeenCalledWith("loc-fr");
    expect(mockGetOrCreate).toHaveBeenCalledWith(
      "app-1", ["APP_IPHONE_67", "APP_IPAD_PRO_3GEN_11", "APP_WATCH_ULTRA"],
    );
  });

  it("falls back to the platform default when the app ships no screenshot yet", async () => {
    mockExists.mockReturnValue(false);
    mockGetOrCreate.mockReturnValue({ id: "01A", doc: {}, updatedAt: "t" });
    const { GET } = await import("@/app/api/apps/[appId]/screenshot-doc/route");

    ascWithSets(["APP_IPHONE_67"]);
    mockSets.mockResolvedValue([
      { id: "set-1", attributes: { screenshotDisplayType: "APP_IPHONE_67" }, screenshots: [] },
    ]);
    await GET(new Request("http://localhost"), params);
    expect(mockGetOrCreate).toHaveBeenLastCalledWith("app-1", ["APP_IPHONE_65", "APP_IPAD_PRO_3GEN_11"]);
  });

  it("seeds a Mac app on the Mac format, never on an iPhone", async () => {
    mockExists.mockReturnValue(false);
    mockGetOrCreate.mockReturnValue({ id: "01A", doc: {}, updatedAt: "t" });
    mockVersions.mockResolvedValue([
      { id: "v1", attributes: { appVersionState: "PREPARE_FOR_SUBMISSION", platform: "MAC_OS" } },
    ]);
    mockSets.mockResolvedValue([]);
    const { GET } = await import("@/app/api/apps/[appId]/screenshot-doc/route");
    await GET(new Request("http://localhost"), params);
    expect(mockGetOrCreate).toHaveBeenLastCalledWith("app-1", ["APP_DESKTOP"]);
  });

  it("leaves the default alone when App Store Connect is unreachable", async () => {
    mockExists.mockReturnValue(false);
    mockGetOrCreate.mockReturnValue({ id: "01A", doc: {}, updatedAt: "t" });
    mockVersions.mockRejectedValue(new Error("no credentials"));
    const { GET } = await import("@/app/api/apps/[appId]/screenshot-doc/route");
    await GET(new Request("http://localhost"), params);
    expect(mockGetOrCreate).toHaveBeenLastCalledWith("app-1", undefined);
  });

  it("maps lib errors through errorJson", async () => {
    mockExists.mockReturnValue(true);
    mockGetOrCreate.mockImplementation(() => { throw new Error("boom"); });
    const { GET } = await import("@/app/api/apps/[appId]/screenshot-doc/route");
    const res = await GET(new Request("http://localhost"), params);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

const validDoc = {
  screenshots: [], selectedIndex: 0, outputDevice: "APP_IPHONE_67",
  customWidth: 1290, customHeight: 2796, currentLanguage: "en-US",
  projectLanguages: ["en-US"], defaults: {},
};

describe("PUT /api/apps/[appId]/screenshot-doc", () => {
  it("saves a valid doc scoped to the appId", async () => {
    mockSave.mockReturnValue({ id: "01A", updatedAt: "2026-08-10T00:00:01.000Z" });
    const { PUT } = await import("@/app/api/apps/[appId]/screenshot-doc/route");
    const res = await PUT(new Request("http://localhost", {
      method: "PUT", body: JSON.stringify({ doc: validDoc }),
    }), params);
    expect(mockSave).toHaveBeenCalledWith("app-1", validDoc);
    expect(await res.json()).toEqual({ id: "01A", updatedAt: "2026-08-10T00:00:01.000Z" });
  });

  it("rejects a body without doc (validation error shape)", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/screenshot-doc/route");
    const res = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({}) }), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    const { PUT } = await import("@/app/api/apps/[appId]/screenshot-doc/route");
    const res = await PUT(new Request("http://localhost", { method: "PUT", body: "{nope" }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });
});

describe("PUT – outputDevices passthrough", () => {
  it("accepts and forwards the working-formats list", async () => {
    mockSave.mockReturnValue({ id: "01A", updatedAt: "t" });
    const { PUT } = await import("@/app/api/apps/[appId]/screenshot-doc/route");
    const res = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ doc: { ...validDoc, outputDevices: ["APP_IPHONE_67", "APP_IPHONE_65"] } }),
    }), params);
    expect(res.status).toBe(200);
    expect(mockSave.mock.calls[0][1].outputDevices).toEqual(["APP_IPHONE_67", "APP_IPHONE_65"]);
  });
});

describe("POST /api/apps/[appId]/screenshot-doc/versions", () => {
  it("creates a named snapshot", async () => {
    mockSnapshot.mockReturnValue({ id: "01B", name: "Export", createdAt: "2026-08-10T18:00:00.000Z" });
    const { POST } = await import("@/app/api/apps/[appId]/screenshot-doc/versions/route");
    const res = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ name: "Export" }),
    }), params);
    expect(res.status).toBe(201);
    expect(mockSnapshot).toHaveBeenCalledWith("app-1", "Export");
    expect(await res.json()).toEqual({ id: "01B", name: "Export", createdAt: "2026-08-10T18:00:00.000Z" });
  });

  it("rejects a blank name", async () => {
    const { POST } = await import("@/app/api/apps/[appId]/screenshot-doc/versions/route");
    const res = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ name: "" }),
    }), params);
    expect(res.status).toBe(400);
    expect(mockSnapshot).not.toHaveBeenCalled();
  });

  it("maps lib errors through errorJson", async () => {
    mockSnapshot.mockImplementation(() => { throw new Error("boom"); });
    const { POST } = await import("@/app/api/apps/[appId]/screenshot-doc/versions/route");
    const res = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ name: "Export" }),
    }), params);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

const idParams = { params: Promise.resolve({ appId: "app-1", id: "01V" }) };

describe("GET /versions", () => {
  it("lists snapshots", async () => {
    mockList.mockReturnValue([{ id: "01V", name: "First", createdAt: "t" }]);
    const { GET } = await import("@/app/api/apps/[appId]/screenshot-doc/versions/route");
    const res = await GET(new Request("http://localhost"), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ versions: [{ id: "01V", name: "First", createdAt: "t" }] });
    expect(mockList).toHaveBeenCalledWith("app-1");
  });

  it("maps lib errors through errorJson", async () => {
    mockList.mockImplementation(() => { throw new Error("boom"); });
    const { GET } = await import("@/app/api/apps/[appId]/screenshot-doc/versions/route");
    expect((await GET(new Request("http://localhost"), params)).status).toBe(502);
  });
});

describe("/versions/[id]", () => {
  it("GET returns the snapshot, 404 when absent", async () => {
    mockGetVersion.mockReturnValue({ id: "01V", name: "First", doc: { a: 1 } });
    const { GET } = await import("@/app/api/apps/[appId]/screenshot-doc/versions/[id]/route");
    expect((await GET(new Request("http://localhost"), idParams)).status).toBe(200);
    mockGetVersion.mockReturnValue(null);
    expect((await GET(new Request("http://localhost"), idParams)).status).toBe(404);
    mockGetVersion.mockImplementation(() => { throw new Error("boom"); });
    expect((await GET(new Request("http://localhost"), idParams)).status).toBe(502);
  });

  it("POST op=restore returns the restored doc", async () => {
    mockRestore.mockReturnValue({ doc: { restored: true } });
    const { POST } = await import("@/app/api/apps/[appId]/screenshot-doc/versions/[id]/route");
    const res = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ op: "restore" }),
    }), idParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ doc: { restored: true } });
    expect(mockRestore).toHaveBeenCalledWith("app-1", "01V");
  });

  it("POST op=duplicate needs a name and returns 201", async () => {
    mockDuplicate.mockReturnValue({ id: "01W", name: "Copy", createdAt: "t" });
    const { POST } = await import("@/app/api/apps/[appId]/screenshot-doc/versions/[id]/route");
    const res = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ op: "duplicate", name: "Copy" }),
    }), idParams);
    expect(res.status).toBe(201);
    const missing = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ op: "duplicate" }),
    }), idParams);
    expect(missing.status).toBe(400);
    mockDuplicate.mockReturnValue(null);
    const gone = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ op: "duplicate", name: "Copy" }),
    }), idParams);
    expect(gone.status).toBe(404);
  });

  it("POST 404s on an unknown id, DELETE deletes", async () => {
    mockRestore.mockReturnValue(null);
    const { POST, DELETE } = await import("@/app/api/apps/[appId]/screenshot-doc/versions/[id]/route");
    const res = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ op: "restore" }),
    }), idParams);
    expect(res.status).toBe(404);
    mockDelete.mockReturnValue(true);
    expect((await DELETE(new Request("http://localhost"), idParams)).status).toBe(204);
    mockDelete.mockReturnValue(false);
    expect((await DELETE(new Request("http://localhost"), idParams)).status).toBe(404);
    mockDelete.mockImplementation(() => { throw new Error("boom"); });
    expect((await DELETE(new Request("http://localhost"), idParams)).status).toBe(502);
  });

  it("maps POST lib errors through errorJson", async () => {
    mockRestore.mockImplementation(() => { throw new Error("boom"); });
    const { POST } = await import("@/app/api/apps/[appId]/screenshot-doc/versions/[id]/route");
    const res = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ op: "restore" }),
    }), idParams);
    expect(res.status).toBe(502);
  });
});
