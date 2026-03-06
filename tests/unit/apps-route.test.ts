import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListApps = vi.fn();
const mockCacheGetMeta = vi.fn();
const mockIsPro = vi.fn();
const mockGetFreeSelectedAppId = vi.fn();
const mockIsDemoMode = vi.fn();

vi.mock("@/lib/asc/apps", () => ({
  listApps: () => mockListApps(),
}));
vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => true,
}));
vi.mock("@/lib/cache", () => ({
  cacheGetMeta: (...args: unknown[]) => mockCacheGetMeta(...args),
}));
vi.mock("@/lib/license", () => ({
  isPro: () => mockIsPro(),
  FREE_LIMITS: { apps: 1, teams: 1 },
}));
vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
  getDemoApps: () => [],
}));
vi.mock("@/lib/app-preferences", () => ({
  getFreeSelectedAppId: () => mockGetFreeSelectedAppId(),
}));

import { GET } from "@/app/api/apps/route";

function makeRequest(url = "http://localhost/api/apps") {
  return new Request(url);
}

const app1 = { id: "1", attributes: { name: "Alpha" } };
const app2 = { id: "2", attributes: { name: "Beta" } };
const app3 = { id: "3", attributes: { name: "Gamma" } };

describe("GET /api/apps", () => {
  beforeEach(() => {
    mockListApps.mockReset();
    mockCacheGetMeta.mockReturnValue(null);
    mockIsPro.mockReturnValue(false);
    mockGetFreeSelectedAppId.mockReturnValue(null);
    mockIsDemoMode.mockReturnValue(false);
  });

  it("returns all apps for pro users", async () => {
    mockIsPro.mockReturnValue(true);
    mockListApps.mockResolvedValue([app1, app2, app3]);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.apps).toHaveLength(3);
    expect(data.truncated).toBe(false);
    expect(data.needsAppSelection).toBe(false);
  });

  it("returns first app and needsAppSelection when free user has multiple apps and no preference", async () => {
    mockListApps.mockResolvedValue([app1, app2, app3]);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.apps).toHaveLength(1);
    expect(data.apps[0].id).toBe("1");
    expect(data.truncated).toBe(true);
    expect(data.needsAppSelection).toBe(true);
  });

  it("returns selected app when free user has a stored preference", async () => {
    mockListApps.mockResolvedValue([app1, app2, app3]);
    mockGetFreeSelectedAppId.mockReturnValue("2");

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.apps).toHaveLength(1);
    expect(data.apps[0].id).toBe("2");
    expect(data.truncated).toBe(true);
    expect(data.needsAppSelection).toBe(false);
  });

  it("falls back to first app when stored preference is invalid", async () => {
    mockListApps.mockResolvedValue([app1, app2]);
    mockGetFreeSelectedAppId.mockReturnValue("deleted-app-id");

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.apps).toHaveLength(1);
    expect(data.apps[0].id).toBe("1");
    expect(data.needsAppSelection).toBe(true);
  });

  it("returns all apps when picker param is set", async () => {
    mockListApps.mockResolvedValue([app1, app2, app3]);

    const res = await GET(makeRequest("http://localhost/api/apps?picker=1"));
    const data = await res.json();

    expect(data.apps).toHaveLength(3);
    expect(data.truncated).toBe(false);
    expect(data.needsAppSelection).toBe(false);
  });

  it("does not truncate when free user has only one app", async () => {
    mockListApps.mockResolvedValue([app1]);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.apps).toHaveLength(1);
    expect(data.truncated).toBe(false);
    expect(data.needsAppSelection).toBe(false);
  });
});
