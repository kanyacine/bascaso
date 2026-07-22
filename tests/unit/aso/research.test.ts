import { describe, it, expect } from "vitest";
import {
  parseResearchInput,
  mergeKeywords,
  appendKeywordToField,
  compareResearchRows,
  deriveOpportunities,
  deriveInsights,
  highlightTitle,
  tierHighlights,
  scoreDelta,
  type ResearchRow,
} from "@/lib/aso/research";
import type { TagScore } from "@/components/keyword-tag-input";
import type { DifficultyBreakdown, RankingTier } from "@/lib/aso/estimators";

/** Competitor fields the opportunity signals and insights read. */
interface OppApp {
  trackName: string;
  userRatingCount: number;
  averageUserRating: number;
  releaseDate: string;
  primaryGenreName: string;
}

function tier(overrides: Partial<RankingTier> = {}): RankingTier {
  return {
    minReviews: 500,
    weakestApp: "Some App",
    medianReviews: 2_000,
    weakCount: 0,
    freshCount: 0,
    titleKeywordCount: 5,
    totalApps: 20,
    tierScore: 50,
    label: "Moderate",
    ...overrides,
  };
}

function breakdown(overrides: Partial<DifficultyBreakdown> = {}): DifficultyBreakdown {
  return {
    totalScore: 50,
    rawTotal: 50,
    overrideReason: null,
    isBrandKeyword: false,
    brandName: null,
    ratingVolume: 50,
    reviewVelocity: 50,
    dominantPlayers: 50,
    ratingQuality: 50,
    marketAge: 50,
    publisherDiversity: 50,
    titleRelevance: 50,
    interpretation: "Moderate",
    titleMatchCount: 10,
    medianReviews: 2_000,
    avgReviews: 3_000,
    rankingTiers: { top5: tier(), top10: tier(), top20: tier() },
    ...overrides,
  } as DifficultyBreakdown;
}

/** Builds a "done" TagScore with sensible defaults, overridable per field. */
function doneScore(overrides: Partial<Extract<TagScore, { status: "done" }>> = {}): TagScore {
  return {
    status: "done",
    opportunity: 50,
    popularity: 50,
    difficulty: 50,
    classification: "Moderate",
    ...overrides,
  };
}

function row(keyword: string, score?: TagScore): ResearchRow {
  return { keyword, score };
}

describe("parseResearchInput", () => {
  it("splits on commas and newlines, trimming and normalizing each piece", () => {
    const input = " Fitness App ,Yoga\n MEDITATION \n,  , running\n";
    expect(parseResearchInput(input)).toEqual([
      "fitness app",
      "yoga",
      "meditation",
      "running",
    ]);
  });

  it("dedups case/space-insensitively, keeping first occurrence order", () => {
    const input = "Yoga, YOGA , meditation,Yoga";
    expect(parseResearchInput(input)).toEqual(["yoga", "meditation"]);
  });

  it("drops keywords longer than 100 characters", () => {
    const tooLong = "a".repeat(101);
    expect(parseResearchInput(`${tooLong},short`)).toEqual(["short"]);
  });

  it("keeps a keyword that is exactly 100 characters", () => {
    const maxLength = "a".repeat(100);
    expect(parseResearchInput(`${maxLength},short`)).toEqual([maxLength, "short"]);
  });

  it("returns an empty array when there is nothing usable", () => {
    expect(parseResearchInput("")).toEqual([]);
    expect(parseResearchInput(",,\n\n,  ,")).toEqual([]);
  });
});

describe("mergeKeywords", () => {
  it("appends only added keywords absent from existing, preserving order", () => {
    const existing = ["fitness", "yoga"];
    const added = ["yoga", "running", "fitness", "meditation"];
    expect(mergeKeywords(existing, added)).toEqual([
      "fitness",
      "yoga",
      "running",
      "meditation",
    ]);
  });

  it("returns added as-is when existing is empty", () => {
    expect(mergeKeywords([], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("returns existing unchanged when added is empty", () => {
    expect(mergeKeywords(["a"], [])).toEqual(["a"]);
  });
});

describe("appendKeywordToField", () => {
  it("returns the keyword alone when the field is empty", () => {
    expect(appendKeywordToField("", "yoga")).toBe("yoga");
  });

  it("appends with a comma separator to a non-empty field", () => {
    expect(appendKeywordToField("fitness,yoga", "running")).toBe(
      "fitness,yoga,running",
    );
  });

  it("returns null when the keyword is already present, case/space-insensitively", () => {
    expect(appendKeywordToField("fitness, Yoga ,run", "YOGA")).toBeNull();
  });

  it("returns null when appending would exceed 100 characters", () => {
    const field = "a".repeat(90);
    const keyword = "b".repeat(10); // 90 + 1 (comma) + 10 = 101
    expect(appendKeywordToField(field, keyword)).toBeNull();
  });

  it("accepts an append that lands at exactly 100 characters", () => {
    const field = "a".repeat(90);
    const keyword = "b".repeat(9); // 90 + 1 (comma) + 9 = 100
    const result = appendKeywordToField(field, keyword);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(100);
  });
});

describe("compareResearchRows", () => {
  describe("keyword column", () => {
    it("sorts alphabetically ascending", () => {
      const rows = [row("cherry"), row("apple"), row("banana")];
      rows.sort(compareResearchRows("keyword", "asc"));
      expect(rows.map((r) => r.keyword)).toEqual(["apple", "banana", "cherry"]);
    });

    it("sorts alphabetically descending", () => {
      const rows = [row("cherry"), row("apple"), row("banana")];
      rows.sort(compareResearchRows("keyword", "desc"));
      expect(rows.map((r) => r.keyword)).toEqual(["cherry", "banana", "apple"]);
    });
  });

  describe("opportunity column", () => {
    it("sorts ascending with missing-value rows pushed to the end, alphabetically", () => {
      const rows = [
        row("b", doneScore({ opportunity: 80 })),
        row("a", doneScore({ opportunity: 20 })),
        row("e", { status: "error" }),
        row("d"),
        row("c", { status: "loading" }),
      ];
      rows.sort(compareResearchRows("opportunity", "asc"));
      expect(rows.map((r) => r.keyword)).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("sorts descending with missing-value rows still pushed to the end", () => {
      const rows = [
        row("b", doneScore({ opportunity: 80 })),
        row("a", doneScore({ opportunity: 20 })),
        row("e", { status: "error" }),
        row("d"),
        row("c", { status: "loading" }),
      ];
      rows.sort(compareResearchRows("opportunity", "desc"));
      expect(rows.map((r) => r.keyword)).toEqual(["b", "a", "c", "d", "e"]);
    });
  });

  describe("difficulty column", () => {
    it("sorts ascending and descending", () => {
      const rows = [
        row("y", doneScore({ difficulty: 70 })),
        row("x", doneScore({ difficulty: 10 })),
        row("z", { status: "loading" }),
      ];
      rows.sort(compareResearchRows("difficulty", "asc"));
      expect(rows.map((r) => r.keyword)).toEqual(["x", "y", "z"]);

      rows.sort(compareResearchRows("difficulty", "desc"));
      expect(rows.map((r) => r.keyword)).toEqual(["y", "x", "z"]);
    });
  });

  describe("classification column", () => {
    it("sorts by verdict quality, best first when descending", () => {
      const rows = [
        row("moderate", doneScore({ classification: "Moderate" })),
        row("avoid", doneScore({ classification: "Avoid" })),
        row("sweet", doneScore({ classification: "Sweet Spot" })),
        row("gem", doneScore({ classification: "Hidden Gem" })),
        row("target", doneScore({ classification: "Good Target" })),
        row("competition", doneScore({ classification: "High Competition" })),
        row("volume", doneScore({ classification: "Low Volume" })),
      ];
      rows.sort(compareResearchRows("classification", "desc"));
      expect(rows.map((r) => r.keyword)).toEqual([
        "sweet", "gem", "target", "moderate", "volume", "competition", "avoid",
      ]);
    });

    it("sorts worst first when ascending and keeps unscored rows last", () => {
      const rows = [
        row("sweet", doneScore({ classification: "Sweet Spot" })),
        row("pending", { status: "loading" }),
        row("avoid", doneScore({ classification: "Avoid" })),
      ];
      rows.sort(compareResearchRows("classification", "asc"));
      expect(rows.map((r) => r.keyword)).toEqual(["avoid", "sweet", "pending"]);
    });
  });

  describe("popularity column", () => {
    it("treats a null popularity (even on a done row) as missing", () => {
      const rows = [
        row("p3", doneScore({ popularity: 50 })),
        row("p1", doneScore({ popularity: 10 })),
        row("p2", doneScore({ popularity: null })),
      ];
      rows.sort(compareResearchRows("popularity", "asc"));
      expect(rows.map((r) => r.keyword)).toEqual(["p1", "p3", "p2"]);

      rows.sort(compareResearchRows("popularity", "desc"));
      expect(rows.map((r) => r.keyword)).toEqual(["p3", "p1", "p2"]);
    });
  });

  describe("rank column", () => {
    it("ranks 1 (best) first in ascending order, undefined/null treated as missing", () => {
      const rows = [
        row("r3", doneScore({ rank: 5 })),
        row("r1", doneScore({ rank: 1 })),
        row("r2", doneScore({ rank: undefined })),
        row("r4", doneScore({ rank: null })),
      ];
      rows.sort(compareResearchRows("rank", "asc"));
      expect(rows.map((r) => r.keyword)).toEqual(["r1", "r3", "r2", "r4"]);
    });

    it("still pushes missing ranks to the end in descending order", () => {
      const rows = [
        row("r3", doneScore({ rank: 5 })),
        row("r1", doneScore({ rank: 1 })),
        row("r2", doneScore({ rank: undefined })),
        row("r4", doneScore({ rank: null })),
      ];
      rows.sort(compareResearchRows("rank", "desc"));
      expect(rows.map((r) => r.keyword)).toEqual(["r3", "r1", "r2", "r4"]);
    });
  });

  describe("pairwise comparator behavior", () => {
    it("always orders a valued row before a valueless row, in either direction", () => {
      const withValue = row("z", doneScore({ opportunity: 10 }));
      const withoutValue = row("a", { status: "loading" });

      expect(
        compareResearchRows("opportunity", "asc")(withoutValue, withValue),
      ).toBeGreaterThan(0);
      expect(
        compareResearchRows("opportunity", "asc")(withValue, withoutValue),
      ).toBeLessThan(0);
      expect(
        compareResearchRows("opportunity", "desc")(withoutValue, withValue),
      ).toBeGreaterThan(0);
      expect(
        compareResearchRows("opportunity", "desc")(withValue, withoutValue),
      ).toBeLessThan(0);
    });

    it("breaks ties on equal values alphabetically ascending, regardless of direction", () => {
      const beta = row("beta", doneScore({ opportunity: 50 }));
      const alpha = row("alpha", doneScore({ opportunity: 50 }));

      expect(compareResearchRows("opportunity", "asc")(beta, alpha)).toBeGreaterThan(0);
      expect(compareResearchRows("opportunity", "asc")(alpha, beta)).toBeLessThan(0);
      expect(compareResearchRows("opportunity", "desc")(beta, alpha)).toBeGreaterThan(0);
      expect(compareResearchRows("opportunity", "desc")(alpha, beta)).toBeLessThan(0);
    });

    it("breaks ties between two valueless rows alphabetically ascending", () => {
      const b = row("b", { status: "loading" });
      const a = row("a", undefined);

      expect(compareResearchRows("opportunity", "asc")(b, a)).toBeGreaterThan(0);
      expect(compareResearchRows("opportunity", "desc")(b, a)).toBeGreaterThan(0);
    });
  });
});

describe("deriveOpportunities", () => {
  function app(overrides: Partial<OppApp> = {}): OppApp {
    return {
      trackName: "Some App",
      userRatingCount: 5_000,
      averageUserRating: 4.0,
      releaseDate: "2015-01-01T08:00:00Z",
      primaryGenreName: "Productivity",
      ...overrides,
    };
  }

  const NOW = new Date("2026-07-22T12:00:00Z");
  const many = (n: number, overrides: Partial<OppApp> = {}) =>
    Array.from({ length: n }, (_, i) => app({ trackName: `App ${i}`, ...overrides }));

  it("returns nothing without competitors", () => {
    expect(deriveOpportunities(breakdown(), [], NOW)).toEqual([]);
  });

  it("flags a strong title gap when no competitor title matches", () => {
    const signals = deriveOpportunities(breakdown({ titleMatchCount: 0 }), many(9), NOW);
    const gap = signals.find((s) => s.key === "titleGapNone");
    expect(gap?.strength).toBe("strong");
  });

  it("flags a moderate title gap up to one third of titles, then stops", () => {
    const few = deriveOpportunities(breakdown({ titleMatchCount: 3 }), many(9), NOW);
    expect(few.find((s) => s.key === "titleGapFew")?.params).toEqual({ count: 3, total: 9 });
    const crowded = deriveOpportunities(breakdown({ titleMatchCount: 4 }), many(9), NOW);
    expect(crowded.map((s) => s.key)).not.toContain("titleGapFew");
  });

  it("names the weakest app and turns strong from three weak competitors", () => {
    const two = [...many(2, { userRatingCount: 10 }), ...many(3)];
    const three = [...many(2, { userRatingCount: 10 }), app({ trackName: "Tiny", userRatingCount: 1 })];
    expect(deriveOpportunities(breakdown(), two, NOW).find((s) => s.key === "weakCompetitors")?.strength)
      .toBe("moderate");
    const strong = deriveOpportunities(breakdown(), three, NOW).find((s) => s.key === "weakCompetitors");
    expect(strong?.strength).toBe("strong");
    expect(strong?.params).toMatchObject({ count: 3, name: "Tiny", reviews: 1 });
  });

  it("counts an app as fresh strictly under 365 days old", () => {
    const fresh = app({ releaseDate: "2025-07-23T12:00:00Z" });
    const stale = app({ releaseDate: "2025-07-22T12:00:00Z" });
    expect(deriveOpportunities(breakdown(), [fresh], NOW).map((s) => s.key)).toContain("activeMarket");
    expect(deriveOpportunities(breakdown(), [stale], NOW).map((s) => s.key)).not.toContain("activeMarket");
  });

  it("flags cross-genre from three distinct genres and lists the first three", () => {
    const genres = ["Book", "Education", "Lifestyle", "Reference"];
    const apps = genres.map((g) => app({ primaryGenreName: g }));
    const signal = deriveOpportunities(breakdown(), apps, NOW).find((s) => s.key === "crossGenre");
    expect(signal?.params).toEqual({ count: 4, genres: "Book, Education, Lifestyle…" });
    expect(deriveOpportunities(breakdown(), apps.slice(0, 2), NOW).map((s) => s.key))
      .not.toContain("crossGenre");
  });
});

describe("deriveInsights", () => {
  const app = (o: Partial<OppApp> = {}): OppApp => ({
    trackName: "Some App",
    userRatingCount: 5_000,
    averageUserRating: 4.0,
    releaseDate: "2015-01-01T08:00:00Z",
    primaryGenreName: "Productivity",
    ...o,
  });
  const many = (n: number, o: Partial<OppApp> = {}) =>
    Array.from({ length: n }, (_, i) => app({ trackName: `App ${i}`, ...o }));
  const keys = (b: DifficultyBreakdown, c: OppApp[]) => deriveInsights(b, c).map((x) => x.key);

  it("returns nothing without competitors", () => {
    expect(deriveInsights(breakdown(), [])).toEqual([]);
  });

  it("reports the score override only when it moved the score", () => {
    const moved = breakdown({ overrideReason: "small_result_set", rawTotal: 60, totalScore: 27 });
    const unmoved = breakdown({ overrideReason: "small_result_set", rawTotal: 27, totalScore: 27 });
    expect(deriveInsights(moved, many(4))[0]).toMatchObject({
      key: "adjustedSmall",
      params: { from: 60, to: 27, count: 4 },
    });
    expect(keys(unmoved, many(4))).not.toContain("adjustedSmall");
  });

  it("splits the weak-leader override on the title match ratio", () => {
    const b = (titleMatchCount: number) =>
      breakdown({ overrideReason: "weak_leader", rawTotal: 60, totalScore: 27, titleMatchCount });
    const apps = [app({ trackName: "Leader", userRatingCount: 3 }), ...many(9)];
    expect(keys(b(4), apps)).toContain("adjustedCompetitive"); // 4/10 > 0.3
    expect(keys(b(3), apps)).toContain("adjustedBackfill"); // 3/10 <= 0.3
  });

  it("counts giant incumbents over the leading half only", () => {
    const withLeaders = (count: number, reviews: number) => [
      ...many(count, { userRatingCount: reviews }),
      ...many(10 - count, { userRatingCount: 10 }),
    ];
    expect(keys(breakdown(), withLeaders(2, 2_000_000))).toContain("incumbentsUltra");
    expect(keys(breakdown(), withLeaders(2, 200_000))).toContain("incumbentsMega");
    // A giant sitting in the trailing half is not an incumbent signal.
    const trailing = [...many(9, { userRatingCount: 10 }), app({ userRatingCount: 2_000_000 })];
    expect(keys(breakdown(), trailing)).not.toContain("incumbentsUltra");
  });

  it("flags the mean/median skew above a factor of three", () => {
    expect(keys(breakdown({ medianReviews: 1_000, avgReviews: 3_001 }), many(5)))
      .toContain("skewedGiants");
    expect(keys(breakdown({ medianReviews: 1_000, avgReviews: 3_000 }), many(5)))
      .not.toContain("skewedGiants");
  });

  it("bands title usage at none, two or fewer, then crowded", () => {
    const at = (titleMatchCount: number) => keys(breakdown({ titleMatchCount }), many(10));
    expect(at(0)).toContain("titleGapNone");
    expect(at(2)).toContain("titleGapFew");
    expect(at(3)).toContain("titleCrowded");
  });

  it("flags a high quality bar from the review-weighted rating", () => {
    expect(keys(breakdown(), many(5, { averageUserRating: 4.6 }))).toContain("qualityBar");
    expect(keys(breakdown(), many(5, { averageUserRating: 4.4 }))).not.toContain("qualityBar");
  });

  it("flags weak competitors from three under 1,000 ratings", () => {
    const weak = (count: number) => [
      ...many(count, { userRatingCount: 10 }),
      ...many(5 - count, { userRatingCount: 50_000 }),
    ];
    expect(keys(breakdown(), weak(3))).toContain("weakCompetitors");
    expect(keys(breakdown(), weak(2))).not.toContain("weakCompetitors");
  });
});

describe("highlightTitle", () => {
  const matched = (t: string, k: string) =>
    highlightTitle(t, k).segments.filter((s) => s.match).map((s) => s.text);

  it("reports no tier when nothing matches", () => {
    const h = highlightTitle("Weather Radar", "sunnah");
    expect(h.tier).toBeNull();
    expect(h.segments).toEqual([{ text: "Weather Radar", match: false }]);
  });

  it("highlights every occurrence, case-insensitively", () => {
    expect(matched("Sunnah Way to sunnah", "sunnah")).toEqual(["Sunnah", "sunnah"]);
  });

  it("prefers the exact phrase over scattered words", () => {
    const h = highlightTitle("Best Prayer Times app", "prayer times");
    expect(h.tier).toBe("exact");
    expect(matched("Best Prayer Times app", "prayer times")).toEqual(["Prayer Times"]);
  });

  it("marks scattered full matches as 'all' and incomplete ones as 'partial'", () => {
    expect(highlightTitle("Times of Prayer", "prayer times").tier).toBe("all");
    expect(highlightTitle("Times of day", "prayer times").tier).toBe("partial");
  });

  it("rebuilds the original title from its segments", () => {
    const title = "Sunnah: The Way of the Best";
    expect(highlightTitle(title, "sunnah way").segments.map((s) => s.text).join("")).toBe(title);
  });
});

describe("tierHighlights", () => {
  it("reports open spots when the tier is not full", () => {
    expect(tierHighlights(tier({ totalApps: 3 }), 5)).toEqual([
      { key: "tierOpenSpots", params: { count: 3, size: 5, open: 2 } },
    ]);
  });

  it("picks the review barrier band from the weakest app", () => {
    const band = (minReviews: number) =>
      tierHighlights(tier({ minReviews, totalApps: 20 }), 20)[0].key;
    expect(band(99)).toBe("tierReviewsEasiest");
    expect(band(100)).toBe("tierReviewsNeeded");
    expect(band(1_000)).toBe("tierReviewsBreakIn");
    expect(band(10_000)).toBe("tierReviewsEstablished");
  });

  it("switches between beatable and no-easy-targets on the weak count", () => {
    const keys = (weakCount: number) =>
      tierHighlights(tier({ weakCount, totalApps: 20 }), 20).map((h) => h.key);
    expect(keys(1)).toContain("tierWeakBeatable");
    expect(keys(0)).toContain("tierNoEasyTargets");
  });

  it("bands title usage at none, under half, and half or more", () => {
    const key = (titleKeywordCount: number) =>
      tierHighlights(tier({ titleKeywordCount, totalApps: 20 }), 20).at(-1)?.key;
    expect(key(0)).toBe("tierTitleNone");
    expect(key(9)).toBe("tierTitleFew");
    expect(key(10)).toBe("tierTitleMany");
  });

  it("only mentions fresh entrants when there are any", () => {
    expect(tierHighlights(tier({ freshCount: 0, totalApps: 20 }), 20).map((h) => h.key))
      .not.toContain("tierFreshEntrants");
    expect(tierHighlights(tier({ freshCount: 2, totalApps: 20 }), 20).map((h) => h.key))
      .toContain("tierFreshEntrants");
  });
});

describe("scoreDelta", () => {
  it("returns null when either value is missing or nothing changed", () => {
    expect(scoreDelta(null, 10)).toBeNull();
    expect(scoreDelta(10, undefined)).toBeNull();
    expect(scoreDelta(10, 10)).toBeNull();
  });

  it("marks an increase as improvement by default", () => {
    expect(scoreDelta(60, 50)).toEqual({ direction: "up", improved: true, amount: 10 });
    expect(scoreDelta(40, 50)).toEqual({ direction: "down", improved: false, amount: 10 });
  });

  it("inverts improvement when lower is better (difficulty, rank)", () => {
    expect(scoreDelta(40, 50, true)).toEqual({ direction: "down", improved: true, amount: 10 });
    expect(scoreDelta(3, 1, true)).toEqual({ direction: "up", improved: false, amount: 2 });
  });
});

describe("results sort column", () => {
  it("sorts by result count with missing counts last", () => {
    const rows: ResearchRow[] = [
      { keyword: "b", score: doneScore({ resultCount: 25 }) },
      { keyword: "a", score: doneScore({ resultCount: 3 }) },
      { keyword: "c", score: doneScore({ resultCount: null }) },
    ];
    rows.sort(compareResearchRows("results", "desc"));
    expect(rows.map((r) => r.keyword)).toEqual(["b", "a", "c"]);
  });
});
