import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCacheInvalidate = vi.fn();
const mockCacheInvalidatePrefix = vi.fn();
const mockListApps = vi.fn();
const mockListVersions = vi.fn();
const mockHasCredentials = vi.fn();
const mockErrorJson = vi.fn();
const mockIsDemoMode = vi.fn();

vi.mock("@/lib/cache", () => ({
  cacheInvalidate: (...args: unknown[]) => mockCacheInvalidate(...args),
  cacheInvalidatePrefix: (...args: unknown[]) =>
    mockCacheInvalidatePrefix(...args),
}));

vi.mock("@/lib/asc/apps", () => ({
  listApps: (...args: unknown[]) => mockListApps(...args),
}));

vi.mock("@/lib/asc/versions", () => ({
  listVersions: (...args: unknown[]) => mockListVersions(...args),
}));

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: () => mockHasCredentials(),
}));

vi.mock("@/lib/demo", () => ({
  isDemoMode: () => mockIsDemoMode(),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-helpers")>();
  return {
    ...actual,
    errorJson: (...args: unknown[]) => mockErrorJson(...args),
  };
});

describe("POST /api/refresh", () => {
  beforeEach(() => {
    mockCacheInvalidate.mockReset();
    mockCacheInvalidatePrefix.mockReset();
    mockListApps.mockReset();
    mockListVersions.mockReset();
    mockHasCredentials.mockReturnValue(true);
    mockIsDemoMode.mockReturnValue(false);
    mockErrorJson.mockImplementation(
      () => new Response(JSON.stringify({ error: "mapped" }), { status: 502 }),
    );
  });

  it("returns ok immediately in demo mode", async () => {
    mockIsDemoMode.mockReturnValue(true);
    const { POST } = await import("@/app/api/refresh/route");

    const response = await POST(
      new Request("http://localhost/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: "app-1" }),
      }),
    );

    expect(await response.json()).toEqual({ ok: true });
    expect(mockListApps).not.toHaveBeenCalled();
  });

  it("returns 400 when no ASC credentials are configured", async () => {
    mockHasCredentials.mockReturnValue(false);
    const { POST } = await import("@/app/api/refresh/route");

    const response = await POST(
      new Request("http://localhost/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: "app-1" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No ASC credentials configured" });
  });

  it("maps errors through errorJson when refresh fails", async () => {
    mockListApps.mockRejectedValue(new Error("ASC unavailable"));
    const { POST } = await import("@/app/api/refresh/route");

    const response = await POST(
      new Request("http://localhost/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: "app-1" }),
      }),
    );

    expect(mockErrorJson).toHaveBeenCalled();
    expect(response.status).toBe(502);
  });

  it("rejects invalid JSON", async () => {
    const { POST } = await import("@/app/api/refresh/route");

    const response = await POST(
      new Request("http://localhost/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid JSON body");
  });

  it("rejects missing appId", async () => {
    const { POST } = await import("@/app/api/refresh/route");

    const response = await POST(
      new Request("http://localhost/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing appId");
  });

  it("invalidates caches and refreshes app/version data", async () => {
    const { POST } = await import("@/app/api/refresh/route");

    const response = await POST(
      new Request("http://localhost/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: "app-1" }),
      }),
    );
    const data = await response.json();

    expect(mockCacheInvalidate).toHaveBeenCalledWith("apps");
    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("versions:");
    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith(
      "tf-pre-release-versions:",
    );
    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith("appInfos:");
    expect(mockCacheInvalidatePrefix).toHaveBeenCalledWith(
      "appInfoLocalizations:",
    );
    expect(mockListApps).toHaveBeenCalledWith(true);
    expect(mockListVersions).toHaveBeenCalledWith("app-1", true);
    expect(data).toEqual({ ok: true });
  });
});
