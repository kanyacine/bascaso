import { describe, it, expect, vi, beforeEach } from "vitest";

const mockHasCredentials = vi.fn();
const mockListApps = vi.fn();
const mockBuildAnalyticsData = vi.fn();
const mockListBuilds = vi.fn();
const mockListGroups = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: (...args: unknown[]) => mockHasCredentials(...args),
}));

vi.mock("@/lib/asc/apps", () => ({
  listApps: (...args: unknown[]) => mockListApps(...args),
}));

vi.mock("@/lib/asc/analytics", () => ({
  buildAnalyticsData: (...args: unknown[]) => mockBuildAnalyticsData(...args),
}));

vi.mock("@/lib/asc/testflight", () => ({
  listBuilds: (...args: unknown[]) => mockListBuilds(...args),
  listGroups: (...args: unknown[]) => mockListGroups(...args),
}));

import { syncApps, syncAnalytics, syncTestFlight } from "@/lib/sync/jobs";

describe("syncApps", () => {
  beforeEach(() => {
    mockHasCredentials.mockReset();
    mockListApps.mockReset();
    mockBuildAnalyticsData.mockReset();
    mockListBuilds.mockReset();
    mockListGroups.mockReset();
  });

  it("calls listApps with forceRefresh when credentials exist", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockListApps.mockResolvedValue([]);

    await syncApps();
    expect(mockListApps).toHaveBeenCalledWith(true);
  });

  it("skips when no credentials exist", async () => {
    mockHasCredentials.mockReturnValue(false);

    await syncApps();
    expect(mockListApps).not.toHaveBeenCalled();
  });

  it("propagates errors from listApps", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockListApps.mockRejectedValue(new Error("API error"));

    await expect(syncApps()).rejects.toThrow("API error");
  });
});

describe("syncAnalytics", () => {
  beforeEach(() => {
    mockHasCredentials.mockReset();
    mockListApps.mockReset();
    mockBuildAnalyticsData.mockReset();
    mockListBuilds.mockReset();
    mockListGroups.mockReset();
  });

  it("fetches analytics for each app sequentially", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockListApps.mockResolvedValue([{ id: "123" }, { id: "456" }]);
    mockBuildAnalyticsData.mockResolvedValue({});

    await syncAnalytics();
    expect(mockListApps).toHaveBeenCalled();
    expect(mockBuildAnalyticsData).toHaveBeenCalledWith("123");
    expect(mockBuildAnalyticsData).toHaveBeenCalledWith("456");
  });

  it("skips when no credentials exist", async () => {
    mockHasCredentials.mockReturnValue(false);

    await syncAnalytics();
    expect(mockListApps).not.toHaveBeenCalled();
    expect(mockBuildAnalyticsData).not.toHaveBeenCalled();
  });
});

describe("syncTestFlight", () => {
  beforeEach(() => {
    mockHasCredentials.mockReset();
    mockListApps.mockReset();
    mockListBuilds.mockReset();
    mockListGroups.mockReset();
  });

  it("fetches builds and groups for each app", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockListApps.mockResolvedValue([{ id: "app-1" }, { id: "app-2" }]);
    mockListBuilds.mockResolvedValue([]);
    mockListGroups.mockResolvedValue([]);

    await syncTestFlight();
    expect(mockListBuilds).toHaveBeenCalledWith("app-1", true);
    expect(mockListBuilds).toHaveBeenCalledWith("app-2", true);
    expect(mockListGroups).toHaveBeenCalledWith("app-1", true);
    expect(mockListGroups).toHaveBeenCalledWith("app-2", true);
  });

  it("skips when no credentials exist", async () => {
    mockHasCredentials.mockReturnValue(false);

    await syncTestFlight();
    expect(mockListApps).not.toHaveBeenCalled();
    expect(mockListBuilds).not.toHaveBeenCalled();
    expect(mockListGroups).not.toHaveBeenCalled();
  });
});
