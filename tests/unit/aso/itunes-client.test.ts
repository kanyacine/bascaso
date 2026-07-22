import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AdaptiveRateLimiter,
  ItunesRateLimited,
  SearchApiUnavailableError,
  searchApps,
} from "@/lib/aso/itunes";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const itunesResult = (id: number, name = `App ${id}`) => ({
  trackId: id,
  trackName: name,
  artworkUrl100: "https://example.com/a.png",
  averageUserRating: 4.5,
  userRatingCount: 1000,
  releaseDate: "2020-01-01T08:00:00Z",
  currentVersionReleaseDate: "2024-01-01T08:00:00Z",
  primaryGenreName: "Health & Fitness",
  formattedPrice: "Free",
  sellerName: "Dev LLC",
  trackViewUrl: `https://apps.apple.com/app/id${id}`,
});

const ssrHtml = (ids: number[], nextPageIds: number[] = []) =>
  new Response(
    `<html><script type="fastboot/shoebox" id="serialized-server-data">${JSON.stringify(
      {
        data: [
          {
            data: {
              shelves: [{ items: ids.map((id) => ({ lockup: { adamId: id } })) }],
              nextPage: {
                results: [
                  ...nextPageIds.map((id) => ({ id, type: "apps" })),
                  { id: 31337, type: "editorial" },
                ],
              },
            },
          },
        ],
      },
    )}</script></html>`,
    { status: 200 },
  );

describe("searchApps", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns parsed apps from the iTunes API", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ results: [itunesResult(1), itunesResult(2)] }),
    );

    const apps = await searchApps("fitness", "fr");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("itunes.apple.com/search");
    expect(url).toContain("term=fitness");
    expect(url).toContain("country=fr");
    expect(url).toContain("entity=software");
    expect(url).toContain("limit=25");
    expect(apps).toHaveLength(2);
    expect(apps[0]).toMatchObject({
      trackId: 1,
      trackName: "App 1",
      userRatingCount: 1000,
      sellerName: "Dev LLC",
    });
  });

  it("fills defaults for missing fields", async () => {
    fetchMock.mockResolvedValueOnce(json({ results: [{ trackId: 9 }, {}] }));

    const apps = await searchApps("fitness");

    expect(apps[0].trackName).toBe("");
    expect(apps[0].userRatingCount).toBe(0);
    expect(apps[0].formattedPrice).toBe("Free");
    expect(apps[1].trackId).toBeUndefined();
  });

  it("returns empty when the search response has no results key", async () => {
    fetchMock.mockResolvedValueOnce(json({}));

    expect(await searchApps("fitness")).toEqual([]);
  });

  it("waits the default delay when Retry-After is unparseable", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 429, { "Retry-After": "soon" }))
      .mockResolvedValueOnce(json({ results: [itunesResult(1)] }));

    const promise = searchApps("fitness");
    await vi.advanceTimersByTimeAsync(2000);
    const apps = await promise;

    expect(apps).toHaveLength(1);
  });

  it("falls back to SSR when the iTunes API stays on 5xx", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValueOnce(json({}, 502))
      .mockResolvedValueOnce(ssrHtml([111]))
      .mockResolvedValueOnce(json({ results: [itunesResult(111)] }));

    const promise = searchApps("fitness");
    await vi.advanceTimersByTimeAsync(60_000);
    const apps = await promise;

    expect(apps.map((a) => a.trackId)).toEqual([111]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("falls back to SSR on a 4xx from the iTunes API", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(ssrHtml([111]))
      .mockResolvedValueOnce(json({ results: [itunesResult(111)] }));

    const promise = searchApps("fitness");
    await vi.advanceTimersByTimeAsync(60_000);
    const apps = await promise;

    expect(apps.map((a) => a.trackId)).toEqual([111]);
  });

  it("retries once after 429 and honours Retry-After", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 429, { "Retry-After": "1" }))
      .mockResolvedValueOnce(json({ results: [itunesResult(1)] }));

    const promise = searchApps("fitness");
    await vi.advanceTimersByTimeAsync(1000);
    const apps = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(apps).toHaveLength(1);
  });

  it("throws ItunesRateLimited when rate-limited twice", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({}, 503, { "Retry-After": "30" }));

    const promise = searchApps("fitness");
    const assertion = expect(promise).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ItunesRateLimited);
      expect((err as ItunesRateLimited).retryAfter).toBe(30);
      return true;
    });
    await vi.advanceTimersByTimeAsync(2000); // default wait without Retry-After
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on 5xx before falling back", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValueOnce(json({ results: [itunesResult(1)] }));

    const promise = searchApps("fitness");
    await vi.advanceTimersByTimeAsync(1500);
    const apps = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(apps).toHaveLength(1);
  });

  it("falls back to SSR + lookup when the iTunes API fails", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ssrHtml([111, 222, 333], [444]))
      .mockResolvedValueOnce(
        json({ results: [itunesResult(111), itunesResult(222), itunesResult(444)] }),
      );

    const promise = searchApps("fitness", "fr");
    await vi.advanceTimersByTimeAsync(60_000);
    const apps = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const ssrUrl = String(fetchMock.mock.calls[1][0]);
    expect(ssrUrl).toContain("apps.apple.com/fr/iphone/search");
    const lookupUrl = String(fetchMock.mock.calls[2][0]);
    expect(lookupUrl).toContain("itunes.apple.com/lookup");
    expect(lookupUrl).toContain("111%2C222%2C333%2C444");
    // 333 missing from lookup results – dropped, ranking order preserved
    expect(apps.map((a) => a.trackId)).toEqual([111, 222, 444]);
  });

  it("returns empty list when SSR finds no apps", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ssrHtml([]));

    const promise = searchApps("obscure niche keyword zzz");
    await vi.advanceTimersByTimeAsync(60_000); // SSR spacing + clock drift across tests
    const apps = await promise;

    expect(apps).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("chunks lookup requests in groups of 50 and survives a failed chunk", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => 1000 + i);
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ssrHtml(ids))
      .mockResolvedValueOnce(
        json({ results: ids.slice(0, 50).map((id) => itunesResult(id)) }),
      )
      .mockResolvedValueOnce(json({}, 500)); // second chunk fails, partial data kept

    const promise = searchApps("fitness", "us", 60);
    await vi.advanceTimersByTimeAsync(60_000); // SSR spacing + clock drift across tests
    const apps = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(apps).toHaveLength(50);
  });

  it("throws SearchApiUnavailableError when SSR page has no data script", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("<html>nope</html>", { status: 200 }));

    const assertion = expect(searchApps("fitness")).rejects.toBeInstanceOf(
      SearchApiUnavailableError,
    );
    await vi.advanceTimersByTimeAsync(60_000); // SSR spacing + clock drift across tests
    await assertion;
  });

  it("does not retry SSR on 4xx", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }));

    const assertion = expect(searchApps("fitness")).rejects.toBeInstanceOf(
      SearchApiUnavailableError,
    );
    await vi.advanceTimersByTimeAsync(60_000); // SSR spacing + clock drift across tests
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries SSR on connection errors, then succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed")) // iTunes
      .mockRejectedValueOnce(new TypeError("SSR connection reset"))
      .mockResolvedValueOnce(ssrHtml([111]))
      .mockResolvedValueOnce(json({ results: [itunesResult(111)] }));

    const promise = searchApps("fitness");
    await vi.advanceTimersByTimeAsync(60_000);
    const apps = await promise;

    expect(apps.map((a) => a.trackId)).toEqual([111]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("returns empty for malformed SSR payloads", async () => {
    const html = (payload: unknown) =>
      new Response(
        `<script id="serialized-server-data">${JSON.stringify(payload)}</script>`,
        { status: 200 },
      );
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(html({ data: [] })) // no inner data
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(html({ data: [{ data: { shelves: [{}] } }] })) // no items/nextPage
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(html({})); // no data key at all

    for (let i = 0; i < 3; i++) {
      const promise = searchApps("fitness");
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await promise).toEqual([]);
    }
  });

  it("throws when the lookup returns no usable data", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ssrHtml([111, 222]))
      .mockResolvedValueOnce(json({}, 200)) // lookup ok but no results key
      .mockResolvedValueOnce(json({}, 500)); // retried chunk? no – single chunk

    const assertion = expect(searchApps("fitness")).rejects.toBeInstanceOf(
      SearchApiUnavailableError,
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  it("retries SSR on 5xx with backoff, then gives up", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("err", { status: 502 }))
      .mockResolvedValueOnce(new Response("err", { status: 502 }))
      .mockResolvedValueOnce(new Response("err", { status: 502 }));

    const promise = searchApps("fitness");
    const assertion = expect(promise).rejects.toBeInstanceOf(
      SearchApiUnavailableError,
    );
    await vi.advanceTimersByTimeAsync(10_000); // 1s + 2s backoff + SSR spacing
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rethrows ItunesRateLimited without attempting SSR", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({}, 429));

    const promise = searchApps("fitness");
    const assertion = expect(promise).rejects.toBeInstanceOf(ItunesRateLimited);
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2); // no SSR call
  });
});

describe("AdaptiveRateLimiter", () => {
  it("starts at the base delay", () => {
    const limiter = new AdaptiveRateLimiter();
    expect(limiter.currentDelayMs).toBe(3000);
    expect(limiter.isSlowedDown).toBe(false);
  });

  it("grows the delay on failures up to the ceiling", () => {
    const limiter = new AdaptiveRateLimiter();
    limiter.recordFailure();
    expect(limiter.currentDelayMs).toBe(4800);
    limiter.recordFailure();
    expect(limiter.currentDelayMs).toBe(7680);
    for (let i = 0; i < 10; i++) limiter.recordFailure();
    expect(limiter.currentDelayMs).toBe(20_000);
    expect(limiter.isSlowedDown).toBe(true);
    expect(limiter.consecutiveFailures).toBe(12);
  });

  it("honours the server Retry-After, capped at the ceiling", () => {
    const limiter = new AdaptiveRateLimiter();
    limiter.recordFailure(8);
    expect(limiter.currentDelayMs).toBe(8000);
    limiter.recordFailure(60);
    expect(limiter.currentDelayMs).toBe(20_000);
  });

  it("keeps the larger of current delay and Retry-After", () => {
    const limiter = new AdaptiveRateLimiter();
    limiter.recordFailure(10);
    expect(limiter.currentDelayMs).toBe(10_000);
    limiter.recordFailure(1);
    expect(limiter.currentDelayMs).toBe(10_000);
  });

  it("decays back toward base after consecutive successes", () => {
    const limiter = new AdaptiveRateLimiter();
    limiter.recordFailure();
    limiter.recordFailure(); // 7680
    limiter.recordSuccess();
    limiter.recordSuccess();
    expect(limiter.currentDelayMs).toBe(7680); // not yet
    limiter.recordSuccess(); // 3rd consecutive → decay ×0.7
    expect(limiter.currentDelayMs).toBeCloseTo(5376, 5);
    expect(limiter.consecutiveFailures).toBe(0);
  });

  it("never decays below the base delay", () => {
    const limiter = new AdaptiveRateLimiter();
    limiter.recordFailure(); // 4800
    for (let i = 0; i < 12; i++) limiter.recordSuccess();
    expect(limiter.currentDelayMs).toBe(3000);
  });
});
