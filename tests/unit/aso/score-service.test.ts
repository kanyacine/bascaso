import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../../helpers/test-db";
import { keywordScoreHistory, keywordScores } from "@/db/schema";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

const mockSearchApps = vi.fn();
vi.mock("@/lib/aso/itunes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aso/itunes")>();
  return {
    ...actual,
    searchApps: (...args: unknown[]) => mockSearchApps(...args),
  };
});

import { clearScoreCache, scoreKeyword, SCORE_TTL_MS } from "@/lib/aso/score-service";
import { ItunesRateLimited, SearchApiUnavailableError } from "@/lib/aso/itunes";

const competitors = [
  {
    trackId: 111,
    trackName: "Meditation App",
    userRatingCount: 50_000,
    averageUserRating: 4.7,
    releaseDate: "2018-01-01T08:00:00Z",
    primaryGenreName: "Health & Fitness",
    sellerName: "ZenCo",
  },
  {
    trackId: 222,
    trackName: "Calm Meditation",
    userRatingCount: 30_000,
    averageUserRating: 4.6,
    releaseDate: "2017-01-01T08:00:00Z",
    primaryGenreName: "Health & Fitness",
    sellerName: "CalmCo",
  },
];

// The pacing chain sleeps between iTunes calls – advance fake timers while
// awaiting service promises.
const settle = async <T>(promise: Promise<T>): Promise<T> => {
  await vi.advanceTimersByTimeAsync(25_000);
  return promise;
};

describe("scoreKeyword", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockSearchApps.mockReset();
    mockSearchApps.mockResolvedValue(competitors);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes, stores and returns a fresh score on cache miss", async () => {
    const score = await settle(scoreKeyword("Meditation", "FR"));

    expect(mockSearchApps).toHaveBeenCalledWith("meditation", "fr");
    expect(score.keyword).toBe("meditation");
    expect(score.country).toBe("fr");
    expect(score.stale).toBe(false);
    expect(score.popularity).toBeGreaterThan(0);
    expect(score.difficulty).toBeGreaterThan(0);
    expect(score.opportunity).toBeGreaterThanOrEqual(0);
    expect(typeof score.classification).toBe("string");

    const rows = testDb.select().from(keywordScores).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].keyword).toBe("meditation");
    expect(rows[0].country).toBe("fr");
    expect(rows[0].opportunity).toBe(score.opportunity);
  });

  it("serves a fresh row from the db without calling iTunes", async () => {
    await settle(scoreKeyword("meditation", "fr"));
    mockSearchApps.mockClear();

    const score = await settle(scoreKeyword("meditation", "fr"));

    expect(mockSearchApps).not.toHaveBeenCalled();
    expect(score.stale).toBe(false);
  });

  it("serves a stale row immediately and refreshes in the background", async () => {
    const staleFetchedAt = Date.now() - SCORE_TTL_MS - 60_000;
    testDb
      .insert(keywordScores)
      .values({
        keyword: "meditation",
        country: "fr",
        popularity: 40,
        difficulty: 50,
        opportunity: 30,
        classification: "Moderate",
        fetchedAt: staleFetchedAt,
      })
      .run();

    const score = await scoreKeyword("meditation", "fr");
    expect(score.stale).toBe(true);
    expect(score.opportunity).toBe(30);

    // Background refresh replaces the row
    await vi.advanceTimersByTimeAsync(25_000);
    const rows = testDb.select().from(keywordScores).all();
    expect(rows).toHaveLength(1);
    expect(mockSearchApps).toHaveBeenCalledTimes(1);
    expect(rows[0].fetchedAt).toBeGreaterThan(staleFetchedAt);
  });

  it("dedupes concurrent requests for the same keyword and country", async () => {
    const [a, b] = await settle(
      Promise.all([
        scoreKeyword("meditation", "fr"),
        scoreKeyword("meditation", "fr"),
      ]),
    );

    expect(mockSearchApps).toHaveBeenCalledTimes(1);
    expect(a.opportunity).toBe(b.opportunity);
  });

  it("stores a null-popularity score when iTunes returns no competitors", async () => {
    mockSearchApps.mockResolvedValue([]);

    const score = await settle(scoreKeyword("zzz niche", "us"));

    expect(score.popularity).toBeNull();
    expect(score.difficulty).toBe(0);
    expect(score.opportunity).toBe(0);
    expect(score.classification).toBe("Low Volume");
  });

  it("swallows background refresh failures and keeps the stale row", async () => {
    const staleFetchedAt = Date.now() - SCORE_TTL_MS - 60_000;
    testDb
      .insert(keywordScores)
      .values({
        keyword: "meditation",
        country: "fr",
        popularity: 40,
        difficulty: 50,
        opportunity: 30,
        classification: "Moderate",
        fetchedAt: staleFetchedAt,
      })
      .run();
    mockSearchApps.mockRejectedValue(new ItunesRateLimited("throttled", 5));

    const score = await scoreKeyword("meditation", "fr");
    expect(score.stale).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    const rows = testDb.select().from(keywordScores).all();
    expect(rows[0].fetchedAt).toBe(staleFetchedAt); // refresh failed, row kept
  });

  it("returns the app's 1-based rank on fresh compute and stores result ids", async () => {
    // SSR-fallback competitors can lack a trackId – they are skipped in ranks.
    mockSearchApps.mockResolvedValue([
      ...competitors,
      { trackName: "No Id App", userRatingCount: 10 },
    ]);
    const score = await settle(scoreKeyword("meditation", "fr", 222));

    expect(score.rank).toBe(2);
    const rows = testDb.select().from(keywordScores).all();
    expect(JSON.parse(rows[0].resultIds ?? "")).toEqual([111, 222]);
  });

  it("computes rank from the cached row without calling iTunes", async () => {
    await settle(scoreKeyword("meditation", "fr"));
    mockSearchApps.mockClear();

    const score = await settle(scoreKeyword("meditation", "fr", 111));

    expect(mockSearchApps).not.toHaveBeenCalled();
    expect(score.rank).toBe(1);
  });

  it("returns a null rank without an app id, when the app is absent, and on legacy rows", async () => {
    const noApp = await settle(scoreKeyword("meditation", "fr"));
    expect(noApp.rank).toBeNull();

    const absent = await settle(scoreKeyword("meditation", "fr", 999));
    expect(absent.rank).toBeNull();

    testDb
      .insert(keywordScores)
      .values({
        keyword: "legacy",
        country: "fr",
        popularity: 40,
        difficulty: 50,
        opportunity: 30,
        classification: "Moderate",
        fetchedAt: Date.now(),
      })
      .run();
    const legacy = await settle(scoreKeyword("legacy", "fr", 111));
    expect(legacy.rank).toBeNull();
  });

  it("stores and returns the difficulty breakdown as details", async () => {
    const fresh = await settle(scoreKeyword("meditation", "fr"));
    expect(fresh.details?.totalScore).toBe(fresh.difficulty);

    const rows = testDb.select().from(keywordScores).all();
    expect(JSON.parse(rows[0].details ?? "").totalScore).toBe(fresh.difficulty);

    // Served from cache with the same details
    mockSearchApps.mockClear();
    const cached = await settle(scoreKeyword("meditation", "fr"));
    expect(mockSearchApps).not.toHaveBeenCalled();
    expect(cached.details?.totalScore).toBe(fresh.difficulty);
  });

  it("returns null details on legacy rows", async () => {
    testDb
      .insert(keywordScores)
      .values({
        keyword: "legacy",
        country: "fr",
        popularity: 40,
        difficulty: 50,
        opportunity: 30,
        classification: "Moderate",
        fetchedAt: Date.now(),
      })
      .run();

    const score = await settle(scoreKeyword("legacy", "fr"));
    expect(score.details).toBeNull();
  });

  it("stores a trimmed competitor snapshot and the result count", async () => {
    const fresh = await settle(scoreKeyword("meditation", "fr"));

    expect(fresh.resultCount).toBe(2);
    expect(fresh.competitors).toHaveLength(2);
    expect(fresh.competitors?.[0]).toMatchObject({
      trackId: 111,
      trackName: "Meditation App",
      sellerName: "ZenCo",
      userRatingCount: 50_000,
    });
    // The heavy description field is not part of the snapshot.
    expect(fresh.competitors?.[0]).not.toHaveProperty("description");

    const rows = testDb.select().from(keywordScores).all();
    expect(JSON.parse(rows[0].competitors ?? "")).toHaveLength(2);

    // Served from cache with the same snapshot and count
    mockSearchApps.mockClear();
    const cached = await settle(scoreKeyword("meditation", "fr"));
    expect(mockSearchApps).not.toHaveBeenCalled();
    expect(cached.resultCount).toBe(2);
    expect(cached.competitors?.[1].trackName).toBe("Calm Meditation");
  });

  it("returns null competitors and resultCount on legacy rows", async () => {
    testDb
      .insert(keywordScores)
      .values({
        keyword: "legacy",
        country: "fr",
        popularity: 40,
        difficulty: 50,
        opportunity: 30,
        classification: "Moderate",
        fetchedAt: Date.now(),
      })
      .run();

    const score = await settle(scoreKeyword("legacy", "fr"));
    expect(score.competitors).toBeNull();
    expect(score.resultCount).toBeNull();
    expect(score.previous).toBeNull();
  });

  it("appends a history observation on each fresh compute", async () => {
    await settle(scoreKeyword("meditation", "fr"));

    const history = testDb.select().from(keywordScoreHistory).all();
    expect(history).toHaveLength(1);
    expect(history[0].keyword).toBe("meditation");
    expect(JSON.parse(history[0].resultIds ?? "")).toEqual([111, 222]);
  });

  it("seeds history from the overwritten row and returns it as previous", async () => {
    const staleFetchedAt = Date.now() - SCORE_TTL_MS - 60_000;
    testDb
      .insert(keywordScores)
      .values({
        keyword: "meditation",
        country: "fr",
        popularity: 40,
        difficulty: 50,
        opportunity: 30,
        classification: "Moderate",
        fetchedAt: staleFetchedAt,
        resultIds: JSON.stringify([222, 111]),
      })
      .run();

    // Stale read: no history yet, so no previous – triggers the refresh.
    const stale = await scoreKeyword("meditation", "fr", 222);
    expect(stale.previous).toBeNull();
    await vi.advanceTimersByTimeAsync(25_000);

    // Fresh row now carries the overwritten observation as previous.
    const score = await settle(scoreKeyword("meditation", "fr", 222));
    expect(score.stale).toBe(false);
    expect(score.rank).toBe(2);
    expect(score.previous).toMatchObject({
      popularity: 40,
      difficulty: 50,
      opportunity: 30,
      rank: 1,
      fetchedAt: staleFetchedAt,
    });

    const history = testDb.select().from(keywordScoreHistory).all();
    expect(history).toHaveLength(2); // seeded old row + new observation
  });

  it("propagates search unavailability", async () => {
    mockSearchApps.mockRejectedValue(new SearchApiUnavailableError("down"));

    const promise = scoreKeyword("meditation", "us");
    const assertion = expect(promise).rejects.toBeInstanceOf(
      SearchApiUnavailableError,
    );
    await vi.advanceTimersByTimeAsync(25_000);
    await assertion;
  });
});

describe("clearScoreCache", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("wipes both the score cache and its history", () => {
    testDb.insert(keywordScores).values({
      keyword: "meditation", country: "us", popularity: 50, difficulty: 20,
      opportunity: 65, classification: "Good Target", fetchedAt: 1,
      resultIds: "[]", details: null, competitors: null,
    }).run();
    testDb.insert(keywordScoreHistory).values({
      keyword: "meditation", country: "us", popularity: 50, difficulty: 20,
      opportunity: 65, resultIds: "[]", fetchedAt: 1,
    }).run();

    clearScoreCache();

    expect(testDb.select().from(keywordScores).all()).toHaveLength(0);
    expect(testDb.select().from(keywordScoreHistory).all()).toHaveLength(0);
  });
});
