import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListApps = vi.fn();
const mockHasCredentials = vi.fn();
const mockCacheGetMeta = vi.fn();
const mockIsDemoMode = vi.fn();
const mockGetDemoApps = vi.fn();
const mockErrorJson = vi.fn();

vi.mock("@/lib/asc/apps", () => ({
  listApps: () => mockListApps(),
}));
vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));
vi.mock("@/lib/cache", () => ({
  cacheGetMeta: (...args: unknown[]) => mockCacheGetMeta(...args),
}));
vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
  getDemoApps: () => mockGetDemoApps(),
}));
vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

import { GET } from "@/app/api/apps/route";

const app1 = { id: "1", attributes: { name: "Alpha" } };
const app2 = { id: "2", attributes: { name: "Beta" } };
const app3 = { id: "3", attributes: { name: "Gamma" } };

describe("GET /api/apps", () => {
  beforeEach(() => {
    mockListApps.mockReset();
    mockHasCredentials.mockReset();
    mockHasCredentials.mockReturnValue(true);
    mockCacheGetMeta.mockReturnValue(null);
    mockIsDemoMode.mockReturnValue(false);
    mockGetDemoApps.mockReturnValue([]);
    mockErrorJson.mockReset();
    mockErrorJson.mockImplementation(
      (_err, status = 500) =>
        new Response(JSON.stringify({ error: "mapped" }), { status: status as number }),
    );
  });

  it("returns all apps", async () => {
    mockListApps.mockResolvedValue([app1, app2, app3]);

    const res = await GET();
    const data = await res.json();

    expect(data.apps).toHaveLength(3);
    expect(data.apps.map((a: { id: string }) => a.id)).toEqual(["1", "2", "3"]);
  });

  it("returns demo apps in demo mode", async () => {
    mockIsDemoMode.mockReturnValue(true);
    mockGetDemoApps.mockReturnValue([{ id: "demo-1" }]);

    const res = await GET();
    const data = await res.json();

    expect(data).toEqual({ apps: [{ id: "demo-1" }], meta: null });
    expect(mockListApps).not.toHaveBeenCalled();
  });

  it("returns empty apps when credentials are missing", async () => {
    mockHasCredentials.mockReturnValue(false);

    const res = await GET();
    const data = await res.json();

    expect(data).toEqual({ apps: [], meta: null });
    expect(mockListApps).not.toHaveBeenCalled();
  });

  it("returns errorJson when listApps throws", async () => {
    mockListApps.mockRejectedValue(new Error("network error"));

    const res = await GET();

    expect(mockErrorJson).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "mapped" });
  });
});
