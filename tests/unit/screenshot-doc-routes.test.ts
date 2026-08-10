import { describe, it, expect, beforeEach, vi } from "vitest";

const mockGetOrCreate = vi.fn();
const mockSave = vi.fn();
const mockSnapshot = vi.fn();
vi.mock("@/lib/screenshot-docs", () => ({
  getOrCreateCurrentDoc: (...a: unknown[]) => mockGetOrCreate(...a),
  saveCurrentDoc: (...a: unknown[]) => mockSave(...a),
  saveVersionSnapshot: (...a: unknown[]) => mockSnapshot(...a),
}));

beforeEach(() => { vi.clearAllMocks(); });

const params = { params: Promise.resolve({ appId: "app-1" }) };

describe("GET /api/apps/[appId]/screenshot-doc", () => {
  it("returns the current doc, creating it on first access", async () => {
    mockGetOrCreate.mockReturnValue({ id: "01A", doc: { screenshots: [] }, updatedAt: "2026-08-10T00:00:00.000Z" });
    const { GET } = await import("@/app/api/apps/[appId]/screenshot-doc/route");
    const res = await GET(new Request("http://localhost"), params);
    expect(mockGetOrCreate).toHaveBeenCalledWith("app-1");
    expect(await res.json()).toEqual({ id: "01A", doc: { screenshots: [] }, updatedAt: "2026-08-10T00:00:00.000Z" });
  });

  it("maps lib errors through errorJson", async () => {
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
