import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../../helpers/test-db";
import { keywordScores } from "@/db/schema";

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

import { scoreKeyword, SCORE_TTL_MS } from "@/lib/aso/score-service";
import { ItunesRateLimited, SearchApiUnavailableError } from "@/lib/aso/itunes";

const competitors = [
  {
    trackName: "Meditation App",
    userRatingCount: 50_000,
    averageUserRating: 4.7,
    releaseDate: "2018-01-01T08:00:00Z",
    primaryGenreName: "Health & Fitness",
    sellerName: "ZenCo",
  },
  {
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
