import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAscFetch = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  ascFetch: (...args: unknown[]) => mockAscFetch(...args),
}));

const mockCacheInvalidate = vi.fn();

vi.mock("@/lib/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheInvalidate: (...args: unknown[]) => mockCacheInvalidate(...args),
}));

import { listAppInfos, listAppInfoLocalizations, updateAppInfoCategories } from "@/lib/asc/app-info";

describe("updateAppInfoCategories", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidate.mockReset();
  });

  it("PATCHes categories and invalidates cache", async () => {
    mockAscFetch.mockResolvedValue({});

    await updateAppInfoCategories("info-1", "app-1", "GAMES", "ENTERTAINMENT");

    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/appInfos/info-1",
      expect.objectContaining({ method: "PATCH" }),
    );

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data.relationships.primaryCategory.data).toEqual({
      type: "appCategories",
      id: "GAMES",
    });
    expect(body.data.relationships.secondaryCategory.data).toEqual({
      type: "appCategories",
      id: "ENTERTAINMENT",
    });
    expect(mockCacheInvalidate).toHaveBeenCalledWith("appInfos:app-1");
  });

  it("sends null data for null categories", async () => {
    mockAscFetch.mockResolvedValue({});

    await updateAppInfoCategories("info-1", "app-1", null, null);

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data.relationships.primaryCategory.data).toBeNull();
    expect(body.data.relationships.secondaryCategory.data).toBeNull();
  });
});

describe("listAppInfos", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
  });

  it("returns cached data when available", async () => {
    const cached = [{ id: "info-1", attributes: { state: "READY_FOR_DISTRIBUTION" } }];
    mockCacheGet.mockReturnValue(cached);

    const result = await listAppInfos("app-1");
    expect(result).toBe(cached);
    expect(mockAscFetch).not.toHaveBeenCalled();
  });

  it("fetches from API on cache miss and resolves categories", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "info-1",
          type: "appInfos",
          attributes: {
            appStoreState: "READY_FOR_SALE",
            appStoreAgeRating: "FOUR_PLUS",
            brazilAgeRating: null,
            brazilAgeRatingV2: null,
            state: "READY_FOR_DISTRIBUTION",
          },
          relationships: {
            primaryCategory: { data: { id: "cat-1", type: "appCategories" } },
            secondaryCategory: { data: null },
          },
        },
      ],
      included: [
        {
          id: "cat-1",
          type: "appCategories",
          attributes: { platforms: ["IOS"], parent: null },
        },
      ],
    });

    const result = await listAppInfos("app-1");
    expect(result).toHaveLength(1);
    expect(result[0].primaryCategory).toEqual({
      id: "cat-1",
      attributes: { platforms: ["IOS"], parent: null },
    });
    expect(result[0].secondaryCategory).toBeNull();
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockCacheGet.mockReturnValue([{ id: "cached" }]);
    mockAscFetch.mockResolvedValue({ data: [] });

    await listAppInfos("app-1", true);
    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(mockAscFetch).toHaveBeenCalled();
  });

  it("handles empty response", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({ data: [] });

    const result = await listAppInfos("app-1");
    expect(result).toEqual([]);
  });

  it("skips non-category items in included array", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "info-1",
          type: "appInfos",
          attributes: {
            appStoreState: "READY_FOR_SALE",
            appStoreAgeRating: null,
            brazilAgeRating: null,
            brazilAgeRatingV2: null,
            state: "READY_FOR_DISTRIBUTION",
          },
        },
      ],
      included: [
        { id: "other-1", type: "notACategory", attributes: {} },
      ],
    });

    const result = await listAppInfos("app-1");
    expect(result[0].primaryCategory).toBeNull();
  });

  it("handles missing included array", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "info-1",
          type: "appInfos",
          attributes: {
            appStoreState: "READY_FOR_SALE",
            appStoreAgeRating: null,
            brazilAgeRating: null,
            brazilAgeRatingV2: null,
            state: "PREPARE_FOR_SUBMISSION",
          },
        },
      ],
    });

    const result = await listAppInfos("app-1");
    expect(result[0].primaryCategory).toBeNull();
    expect(result[0].secondaryCategory).toBeNull();
  });
});

describe("listAppInfoLocalizations", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
  });

  it("returns cached data when available", async () => {
    const cached = [{ id: "loc-1", attributes: { locale: "en-US" } }];
    mockCacheGet.mockReturnValue(cached);

    const result = await listAppInfoLocalizations("info-1");
    expect(result).toBe(cached);
  });

  it("fetches from API on cache miss", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch.mockResolvedValue({
      data: [
        {
          id: "loc-1",
          type: "appInfoLocalizations",
          attributes: {
            locale: "en-US",
            name: "My App",
            subtitle: "Subtitle",
            privacyPolicyText: null,
            privacyPolicyUrl: "https://example.com/privacy",
            privacyChoicesUrl: null,
          },
        },
      ],
    });

    const result = await listAppInfoLocalizations("info-1");
    expect(result).toHaveLength(1);
    expect(result[0].attributes.locale).toBe("en-US");
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it("bypasses cache when forceRefresh is true", async () => {
    mockCacheGet.mockReturnValue([]);
    mockAscFetch.mockResolvedValue({ data: [] });

    await listAppInfoLocalizations("info-1", true);
    expect(mockCacheGet).not.toHaveBeenCalled();
  });
});
