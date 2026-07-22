import { describe, it, expect, vi } from "vitest";

// Ported from respectaso aso/dashboard_summary.py. estimateDownloads is
// wrapped (not replaced) so expected numbers below are always derived from
// the real estimator rather than hardcoded floats, while still letting us
// assert computeStorefrontSummary skips the estimator entirely when
// includeDownloads is false (rule: the caller hides those sections, so we
// must not pay for the computation).
const estimateDownloadsSpy = vi.fn();
vi.mock("@/lib/aso/downloads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aso/downloads")>();
  return {
    ...actual,
    estimateDownloads: (...args: Parameters<typeof actual.estimateDownloads>) => {
      estimateDownloadsSpy(...args);
      return actual.estimateDownloads(...args);
    },
  };
});

import { estimateDownloads } from "@/lib/aso/downloads";
import {
  classificationDistribution,
  computeStorefrontSummary,
  downloadIntervalAtRank,
  formatDownloadNumber,
  formatInterval,
  rankDistribution,
  type SummaryInput,
} from "@/lib/aso/summary";

const US = "us";

function item(overrides: Partial<SummaryInput>): SummaryInput {
  return {
    keyword: "kw",
    popularity: null,
    rank: null,
    previousRank: null,
    hasPrevious: false,
    classification: "Moderate",
    ...overrides,
  };
}

describe("downloadIntervalAtRank", () => {
  it("is zero when popularity is null", () => {
    expect(downloadIntervalAtRank(null, 1, US)).toEqual({ low: 0, high: 0 });
  });

  it("is zero when rank is null (unranked keyword)", () => {
    expect(downloadIntervalAtRank(50, null, US)).toEqual({ low: 0, high: 0 });
  });

  it("is zero when rank is below 1", () => {
    expect(downloadIntervalAtRank(50, 0, US)).toEqual({ low: 0, high: 0 });
    expect(downloadIntervalAtRank(50, -3, US)).toEqual({ low: 0, high: 0 });
  });

  it("is zero beyond the 20 modelled positions", () => {
    expect(downloadIntervalAtRank(50, 21, US)).toEqual({ low: 0, high: 0 });
  });

  it("matches estimateDownloads at the first and last modelled positions", () => {
    const est = estimateDownloads(50, US);
    expect(downloadIntervalAtRank(50, 1, US)).toEqual({
      low: est.positions[0].downloadsLow,
      high: est.positions[0].downloadsHigh,
    });
    expect(downloadIntervalAtRank(50, 20, US)).toEqual({
      low: est.positions[19].downloadsLow,
      high: est.positions[19].downloadsHigh,
    });
  });
});

describe("computeStorefrontSummary – empty input", () => {
  it("returns zeroed aggregates and no picks", () => {
    const result = computeStorefrontSummary([], US, true);
    expect(result.totalKeywords).toBe(0);
    expect(result.rankingKeywords).toBe(0);
    expect(result.bestRank).toBeNull();
    expect(result.inTop20).toBe(0);
    expect(result.movers).toEqual({ up: 0, down: 0 });
    expect(result.downloads).toEqual({ low: 0, high: 0 });
    expect(result.headroom).toEqual({ low: 0, high: 0 });
    expect(result.topPerformer).toBeNull();
    expect(result.biggestGap).toBeNull();
  });

  it("returns nulls for the download fields when includeDownloads is false", () => {
    const result = computeStorefrontSummary([], US, false);
    expect(result.downloads).toBeNull();
    expect(result.headroom).toBeNull();
    expect(result.topPerformer).toBeNull();
    expect(result.biggestGap).toBeNull();
  });
});

describe("computeStorefrontSummary – mixed ranked/unranked aggregation", () => {
  // A: ranked at #3, popularity 50 – the only item contributing current downloads.
  // B: unranked, popularity 30 – contributes potential only (headroom).
  // C: ranked at #10, popularity null – contributes neither (no popularity, no estimate).
  // D: ranked at #25, popularity 20 – outside the 20 modelled positions, so
  //    current is zero even though it ranks; potential still counts.
  const A = item({ keyword: "a", popularity: 50, rank: 3 });
  const B = item({ keyword: "b", popularity: 30, rank: null });
  const C = item({ keyword: "c", popularity: null, rank: 10 });
  const D = item({ keyword: "d", popularity: 20, rank: 25 });
  const items = [A, B, C, D];

  const estA = estimateDownloads(50, US);
  const estB = estimateDownloads(30, US);
  const estD = estimateDownloads(20, US);

  const currentA = { low: estA.positions[2].downloadsLow, high: estA.positions[2].downloadsHigh };
  const potentialA = { low: estA.positions[0].downloadsLow, high: estA.positions[0].downloadsHigh };
  const potentialB = { low: estB.positions[0].downloadsLow, high: estB.positions[0].downloadsHigh };
  const potentialD = { low: estD.positions[0].downloadsLow, high: estD.positions[0].downloadsHigh };

  it("computes rank-based aggregates ignoring popularity", () => {
    const result = computeStorefrontSummary(items, US, true);
    expect(result.totalKeywords).toBe(4);
    expect(result.rankingKeywords).toBe(3); // A, C, D rank; B does not
    expect(result.bestRank).toBe(3);
    expect(result.inTop20).toBe(2); // A (#3) and C (#10); D is #25
  });

  it("sums current downloads over ranked items only", () => {
    const result = computeStorefrontSummary(items, US, true);
    expect(result.downloads).toEqual(currentA); // B, C, D all contribute zero current
  });

  it("clips headroom to >= 0 with the low/high cross-over", () => {
    const result = computeStorefrontSummary(items, US, true);
    const potentialLow = potentialA.low + potentialB.low + potentialD.low;
    const potentialHigh = potentialA.high + potentialB.high + potentialD.high;
    expect(result.headroom).toEqual({
      low: Math.max(0, potentialLow - currentA.high),
      high: Math.max(0, potentialHigh - currentA.low),
    });
  });

  it("picks the only item with positive current downloads as topPerformer", () => {
    const result = computeStorefrontSummary(items, US, true);
    expect(result.topPerformer).toEqual({
      keyword: "a",
      rank: 3,
      low: currentA.low,
      high: currentA.high,
      popularity: 50,
    });
  });

  it("does not call estimateDownloads when includeDownloads is false", () => {
    estimateDownloadsSpy.mockClear();
    const result = computeStorefrontSummary(items, US, false);
    expect(estimateDownloadsSpy).not.toHaveBeenCalled();
    expect(result.downloads).toBeNull();
    expect(result.headroom).toBeNull();
    expect(result.topPerformer).toBeNull();
    expect(result.biggestGap).toBeNull();
    // Rank-only aggregates are unaffected by the includeDownloads flag.
    expect(result.totalKeywords).toBe(4);
    expect(result.rankingKeywords).toBe(3);
    expect(result.bestRank).toBe(3);
    expect(result.inTop20).toBe(2);
  });
});

describe("computeStorefrontSummary – topPerformer tie-break", () => {
  it("keeps the first item when a later one ties on current high (strict >)", () => {
    // Same popularity and rank -> identical current interval for both.
    const first = item({ keyword: "first", popularity: 50, rank: 1 });
    const second = item({ keyword: "second", popularity: 50, rank: 1 });
    const result = computeStorefrontSummary([first, second], US, true);
    expect(result.topPerformer?.keyword).toBe("first");
  });

  it("stays null when every current high is zero", () => {
    const items = [
      item({ keyword: "unranked", popularity: 50, rank: null }),
      item({ keyword: "no-pop", popularity: null, rank: 5 }),
    ];
    const result = computeStorefrontSummary(items, US, true);
    expect(result.topPerformer).toBeNull();
  });
});

describe("computeStorefrontSummary – biggestGap", () => {
  it("excludes items below popularity 5 even when their raw gap is larger", () => {
    // X: popularity 4 (< 5 threshold), unranked -> its entire potential is
    // "gap", but it must not qualify.
    // Y: popularity 5 (meets the threshold), ranked #1 -> current equals
    // potential exactly, so its gap is 0 – yet it must still win because X
    // is disqualified by the popularity gate.
    const x = item({ keyword: "x", popularity: 4, rank: null });
    const y = item({ keyword: "y", popularity: 5, rank: 1 });
    const result = computeStorefrontSummary([x, y], US, true);
    expect(result.biggestGap).toEqual({
      keyword: "y",
      rank: 1,
      popularity: 5,
      headroomLow: 0,
      headroomHigh: 0,
    });
  });

  it("keeps the first item when a later one ties on gap (strict >)", () => {
    const first = item({ keyword: "first", popularity: 30, rank: null });
    const second = item({ keyword: "second", popularity: 30, rank: null });
    const result = computeStorefrontSummary([first, second], US, true);
    expect(result.biggestGap?.keyword).toBe("first");
  });

  it("is null when no item has popularity >= 5", () => {
    const items = [
      item({ keyword: "low1", popularity: 1, rank: null }),
      item({ keyword: "low2", popularity: null, rank: null }),
    ];
    const result = computeStorefrontSummary(items, US, true);
    expect(result.biggestGap).toBeNull();
  });
});

describe("computeStorefrontSummary – movers", () => {
  it("counts an improved rank as up", () => {
    const items = [item({ previousRank: 10, rank: 5, hasPrevious: true })];
    expect(computeStorefrontSummary(items, US, false).movers).toEqual({ up: 1, down: 0 });
  });

  it("counts a worsened rank as down", () => {
    const items = [item({ previousRank: 5, rank: 10, hasPrevious: true })];
    expect(computeStorefrontSummary(items, US, false).movers).toEqual({ up: 0, down: 1 });
  });

  it("counts an unchanged rank as neither", () => {
    const items = [item({ previousRank: 5, rank: 5, hasPrevious: true })];
    expect(computeStorefrontSummary(items, US, false).movers).toEqual({ up: 0, down: 0 });
  });

  it("ignores a null previousRank even when hasPrevious is true", () => {
    const items = [item({ previousRank: null, rank: 5, hasPrevious: true })];
    expect(computeStorefrontSummary(items, US, false).movers).toEqual({ up: 0, down: 0 });
  });

  it("ignores a null current rank even when hasPrevious is true", () => {
    const items = [item({ previousRank: 5, rank: null, hasPrevious: true })];
    expect(computeStorefrontSummary(items, US, false).movers).toEqual({ up: 0, down: 0 });
  });

  it("ignores valid ranks when hasPrevious is false", () => {
    const items = [item({ previousRank: 10, rank: 5, hasPrevious: false })];
    expect(computeStorefrontSummary(items, US, false).movers).toEqual({ up: 0, down: 0 });
  });
});

describe("rankDistribution", () => {
  it("buckets at the 5/10/20/25 edges, unranked beyond and for null", () => {
    const ranks = [5, 6, 10, 11, 20, 21, 25, 26, null];
    const items = ranks.map((rank) => item({ rank }));
    expect(rankDistribution(items)).toEqual({
      t5: 1, // 5
      t10: 2, // 6, 10
      t20: 2, // 11, 20
      t25: 2, // 21, 25
      unranked: 2, // 26 (defensive, beyond fetched top 25), null
    });
  });
});

describe("classificationDistribution", () => {
  it("counts by classification, falling back empty strings to Moderate", () => {
    const items = [
      item({ classification: "Sweet Spot" }),
      item({ classification: "" }),
      item({ classification: "Moderate" }),
      item({ classification: "" }),
    ];
    expect(classificationDistribution(items)).toEqual({ "Sweet Spot": 1, Moderate: 3 });
  });
});

describe("formatDownloadNumber", () => {
  it("renders null, NaN and non-positive values as \"0\"", () => {
    expect(formatDownloadNumber(null)).toBe("0");
    expect(formatDownloadNumber(NaN)).toBe("0");
    expect(formatDownloadNumber(0)).toBe("0");
    expect(formatDownloadNumber(-5)).toBe("0");
  });

  it("renders thousands with one decimal and a K suffix, trailing .0 stripped", () => {
    expect(formatDownloadNumber(1234)).toBe("1.2K");
    expect(formatDownloadNumber(1000)).toBe("1K");
  });

  it("renders sub-1 values with one decimal", () => {
    expect(formatDownloadNumber(0.4)).toBe("0.4");
  });

  it("renders 1-9 with one decimal, trailing .0 stripped", () => {
    expect(formatDownloadNumber(7.5)).toBe("7.5");
    expect(formatDownloadNumber(8)).toBe("8");
  });

  it("renders 10+ as the nearest integer", () => {
    expect(formatDownloadNumber(27.4)).toBe("27");
    expect(formatDownloadNumber(27.6)).toBe("28");
  });
});

describe("formatInterval", () => {
  it("renders an em dash when both bounds are null or non-positive", () => {
    expect(formatInterval(null, null)).toBe("—");
    expect(formatInterval(0, 0)).toBe("—");
    expect(formatInterval(-5, 0)).toBe("—");
  });

  it("collapses to the high end when low is non-positive", () => {
    expect(formatInterval(0, 8)).toBe("~8");
  });

  it("renders a full range when low and high differ", () => {
    expect(formatInterval(0.4, 2)).toBe("~0.4–2");
  });

  it("collapses to a single value when low and high format to the same string", () => {
    // 100.2 and 100.4 both round to "100" at the >= 10 formatting tier.
    expect(formatInterval(100.2, 100.4)).toBe("~100");
  });
});
