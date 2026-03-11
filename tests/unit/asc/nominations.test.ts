import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAscFetch = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheInvalidate = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  ascFetch: (...args: unknown[]) => mockAscFetch(...args),
}));

vi.mock("@/lib/cache", () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  cacheInvalidate: (...args: unknown[]) => mockCacheInvalidate(...args),
}));

import {
  listNominations,
  getNomination,
  createNomination,
  updateNomination,
  deleteNomination,
  invalidateNominationsCache,
} from "@/lib/asc/nominations";

describe("listNominations", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheInvalidate.mockReset();
  });

  it("returns cached nominations when available", async () => {
    const cached = [{ id: "n1", attributes: { name: "Test" }, relatedAppIds: [] }];
    mockCacheGet.mockReturnValue(cached);

    const result = await listNominations();
    expect(result).toEqual(cached);
    expect(mockAscFetch).not.toHaveBeenCalled();
  });

  it("fetches and transforms nominations from API (3 state queries)", async () => {
    mockCacheGet.mockReturnValue(null);

    // First call (DRAFT) returns one nomination, other states return empty
    mockAscFetch
      .mockResolvedValueOnce({
        data: [
          {
            id: "n1",
            type: "nominations",
            attributes: {
              name: "Big Launch",
              description: "We are launching!",
              notes: null,
              type: "APP_LAUNCH",
              state: "DRAFT",
              publishStartDate: "2026-04-01T00:00:00Z",
              publishEndDate: null,
              deviceFamilies: null,
              locales: ["en-US"],
              hasInAppEvents: false,
              launchInSelectMarketsFirst: false,
              preOrderEnabled: false,
              supplementalMaterialsUris: null,
              createdDate: "2026-03-01T00:00:00Z",
              lastModifiedDate: "2026-03-01T00:00:00Z",
              submittedDate: null,
            },
            relationships: {
              relatedApps: {
                data: [
                  { id: "app-1", type: "apps" },
                  { id: "app-2", type: "apps" },
                ],
              },
            },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const result = await listNominations();

    expect(mockAscFetch).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("n1");
    expect(result[0].attributes.name).toBe("Big Launch");
    expect(result[0].relatedAppIds).toEqual(["app-1", "app-2"]);
    expect(mockCacheSet).toHaveBeenCalledWith(
      "nominations",
      result,
      expect.any(Number),
    );
  });

  it("bypasses cache on forceRefresh", async () => {
    mockCacheGet.mockReturnValue([{ id: "old" }]);
    mockAscFetch.mockResolvedValue({ data: [] });

    const result = await listNominations(true);
    expect(result).toEqual([]);
    expect(mockAscFetch).toHaveBeenCalledTimes(3);
  });

  it("handles nominations with no relatedApps relationship", async () => {
    mockCacheGet.mockReturnValue(null);
    mockAscFetch
      .mockResolvedValueOnce({
        data: [
          {
            id: "n1",
            type: "nominations",
            attributes: {
              name: "Test",
              description: "Desc",
              notes: null,
              type: "NEW_CONTENT",
              state: "DRAFT",
              publishStartDate: "2026-04-01T00:00:00Z",
              publishEndDate: null,
              deviceFamilies: null,
              locales: null,
              hasInAppEvents: null,
              launchInSelectMarketsFirst: null,
              preOrderEnabled: null,
              supplementalMaterialsUris: null,
              createdDate: "2026-03-01T00:00:00Z",
              lastModifiedDate: "2026-03-01T00:00:00Z",
              submittedDate: null,
            },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const result = await listNominations();
    expect(result[0].relatedAppIds).toEqual([]);
  });
});

describe("getNomination", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
  });

  it("fetches a single nomination by ID", async () => {
    mockAscFetch.mockResolvedValue({
      data: {
        id: "n1",
        type: "nominations",
        attributes: {
          name: "Test",
          description: "Desc",
          notes: "Some notes",
          type: "APP_ENHANCEMENTS",
          state: "SUBMITTED",
          publishStartDate: "2026-04-01T00:00:00Z",
          publishEndDate: "2026-05-01T00:00:00Z",
          deviceFamilies: ["IPHONE", "IPAD"],
          locales: ["en-US", "fr-FR"],
          hasInAppEvents: true,
          launchInSelectMarketsFirst: false,
          preOrderEnabled: false,
          supplementalMaterialsUris: ["https://example.com"],
          createdDate: "2026-03-01T00:00:00Z",
          lastModifiedDate: "2026-03-05T00:00:00Z",
          submittedDate: "2026-03-05T00:00:00Z",
        },
        relationships: {
          relatedApps: {
            data: [{ id: "app-1", type: "apps" }],
          },
        },
      },
    });

    const result = await getNomination("n1");
    expect(result.id).toBe("n1");
    expect(result.attributes.state).toBe("SUBMITTED");
    expect(result.relatedAppIds).toEqual(["app-1"]);
  });
});

describe("createNomination", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidate.mockReset();
  });

  it("creates a nomination and invalidates cache", async () => {
    mockAscFetch.mockResolvedValue({
      data: { id: "n-new", type: "nominations" },
    });

    const id = await createNomination({
      name: "New Feature",
      description: "A big update",
      type: "APP_ENHANCEMENTS",
      publishStartDate: "2026-04-01T00:00:00Z",
      submitted: false,
      relatedAppIds: ["app-1"],
    });

    expect(id).toBe("n-new");
    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/nominations",
      expect.objectContaining({ method: "POST" }),
    );

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data.type).toBe("nominations");
    expect(body.data.attributes.name).toBe("New Feature");
    expect(body.data.attributes.submitted).toBe(false);
    expect(body.data.relationships.relatedApps.data).toEqual([
      { type: "apps", id: "app-1" },
    ]);
    expect(mockCacheInvalidate).toHaveBeenCalledWith("nominations");
  });

  it("includes optional fields when provided", async () => {
    mockAscFetch.mockResolvedValue({
      data: { id: "n-new", type: "nominations" },
    });

    await createNomination({
      name: "Launch",
      description: "Initial launch",
      notes: "Extra info",
      type: "APP_LAUNCH",
      publishStartDate: "2026-04-01T00:00:00Z",
      publishEndDate: "2026-05-01T00:00:00Z",
      deviceFamilies: ["IPHONE"],
      locales: ["en-US", "de-DE"],
      hasInAppEvents: true,
      launchInSelectMarketsFirst: true,
      preOrderEnabled: false,
      supplementalMaterialsUris: ["https://example.com/video"],
      submitted: true,
      relatedAppIds: ["app-1", "app-2"],
    });

    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data.attributes.notes).toBe("Extra info");
    expect(body.data.attributes.publishEndDate).toBe("2026-05-01T00:00:00Z");
    expect(body.data.attributes.deviceFamilies).toEqual(["IPHONE"]);
    expect(body.data.attributes.locales).toEqual(["en-US", "de-DE"]);
    expect(body.data.attributes.hasInAppEvents).toBe(true);
    expect(body.data.attributes.submitted).toBe(true);
    expect(body.data.relationships.relatedApps.data).toHaveLength(2);
  });
});

describe("updateNomination", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidate.mockReset();
  });

  it("PATCHes the nomination and invalidates cache", async () => {
    mockAscFetch.mockResolvedValue(null);

    await updateNomination("n1", { name: "Updated Name" });

    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/nominations/n1",
      expect.objectContaining({ method: "PATCH" }),
    );
    const body = JSON.parse(mockAscFetch.mock.calls[0][1].body);
    expect(body.data.id).toBe("n1");
    expect(body.data.attributes.name).toBe("Updated Name");
    expect(mockCacheInvalidate).toHaveBeenCalledWith("nominations");
  });
});

describe("deleteNomination", () => {
  beforeEach(() => {
    mockAscFetch.mockReset();
    mockCacheInvalidate.mockReset();
  });

  it("DELETEs the nomination and invalidates cache", async () => {
    mockAscFetch.mockResolvedValue(null);

    await deleteNomination("n1");

    expect(mockAscFetch).toHaveBeenCalledWith(
      "/v1/nominations/n1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(mockCacheInvalidate).toHaveBeenCalledWith("nominations");
  });
});

describe("invalidateNominationsCache", () => {
  beforeEach(() => {
    mockCacheInvalidate.mockReset();
  });

  it("invalidates the nominations cache key", () => {
    invalidateNominationsCache();
    expect(mockCacheInvalidate).toHaveBeenCalledWith("nominations");
    expect(mockCacheInvalidate).toHaveBeenCalledTimes(1);
  });
});
