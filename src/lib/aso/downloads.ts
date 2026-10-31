/* Portions derived from RespectASO (https://github.com/respectlytics/respectaso),
 * aso/services.py DownloadEstimator and aso/scoring.py at 798335f
 * (2026-10-24), AGPL-3.0, Copyright Respectlytics. */

// Estimates daily downloads per ranking position for a keyword:
//   downloads = daily searches × tap-through rate(rank) × install rate
// Daily searches come from the popularity curve, scaled by the storefront's
// market size (./countries). Every figure is shown as a range from a tenth of
// the estimate to the estimate. Parity is enforced by
// tests/unit/aso/downloads.test.ts against tests/unit/aso/parity-vectors.json.

import { marketSize, STOREFRONT_MARKETS } from "./countries";

/**
 * The storefront the model was historically calibrated on. Upstream now
 * measures 48 markets (see isMeasuredMarket); outside the US estimates stay
 * hidden unless the user opts in (Settings › ASO).
 */
export const DOWNLOADS_CALIBRATED_COUNTRY = "us";
export const DOWNLOADS_ALL_STOREFRONTS_KEY = "aso-downloads-all-storefronts";

export interface DownloadRange {
  low: number;
  high: number;
}

export interface DownloadPosition {
  pos: number;
  ttr: number;
  downloadsLow: number;
  downloadsHigh: number;
}

export interface DownloadEstimate {
  dailySearches: number;
  /** One entry per search-result position, 1-20. */
  positions: DownloadPosition[];
  tiers: { top5: DownloadRange; top6To10: DownloadRange; top11To20: DownloadRange };
  /** Under one search a day: a range of zeros is a fact, not a bug. */
  belowThreshold: boolean;
  /** Whether the market size behind the numbers was measured or derived. */
  marketSource: "measured" | "derived";
}

/**
 * Popularity → estimated daily searches (US App Store baseline), anchored to
 * Apple's top-search-terms dataset: ~70/day at popularity 40 (the dataset
 * floor), a linear ramp below, ~15%/point log-linear growth above.
 */
export const POP_TO_SEARCHES: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [20, 35],
  [39, 65],
  [40, 70],
  [45, 140],
  [50, 280],
  [55, 570],
  [60, 1_150],
  [65, 2_300],
  [70, 4_600],
  [75, 9_300],
  [80, 19_000],
  [85, 38_000],
  [90, 76_000],
  [95, 152_000],
  [100, 300_000],
];

/** Interpolate daily search volume (US) from a popularity score. */
export function popToSearches(popularity: number | null | undefined): number {
  if (popularity == null || popularity <= 0) return 0;
  const pts = POP_TO_SEARCHES;
  if (popularity <= pts[0][0]) return pts[0][1] * (popularity / pts[0][0]);
  if (popularity >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  let i = 1;
  while (popularity > pts[i][0]) i++;
  const [p0, s0] = pts[i - 1];
  const [p1, s1] = pts[i];
  return s0 + ((popularity - p0) / (p1 - p0)) * (s1 - s0);
}

/** Estimated searches per day for a keyword in a storefront (US curve ×
 *  market size). Country omitted = the US scale. */
export function dailySearches(popularity: number | null | undefined, country?: string | null): number {
  const searches = popToSearches(popularity ?? 0);
  if (!country) return searches;
  return searches * marketSize(country);
}

/** Position → tap-through rate (fraction of searchers who tap), index 0 =
 *  position 1. Power-law decay: steep to #5, gradual tail after. */
const TTR: readonly number[] = [
  0.3, 0.18, 0.12, 0.085, 0.06, 0.045, 0.033, 0.025, 0.019, 0.013, 0.009, 0.007, 0.0055, 0.0042,
  0.0033, 0.0025, 0.0019, 0.0014, 0.001, 0.0007,
];

/** Install rate (tap → install): 5%, the low end for free apps. */
const CVR = 0.05;

/** Every download range runs from a tenth of the estimate to the estimate. */
export const RANGE_LOW_SHARE = 0.1;

/** Past #20 the rate keeps falling as a power law, with the exponent the
 *  table shows between #10 and #20 (~4.2): never a cliff to zero. */
const TAIL_EXPONENT = Math.log(TTR[9] / TTR[19]) / Math.log(20 / 10);

/** Share of searchers who tap the result at `rank`, for any real rank:
 *  the table at whole ranks 1-20, log-interpolated between, power law past 20. */
export function ttrAt(rank: number): number {
  if (rank <= 1) return TTR[0];
  if (rank <= 20) {
    const low = Math.floor(rank);
    if (low >= 20) return TTR[19];
    const fraction = rank - low;
    if (fraction === 0) return TTR[low - 1];
    return Math.exp(Math.log(TTR[low - 1]) * (1 - fraction) + Math.log(TTR[low]) * fraction);
  }
  return TTR[19] * (20 / rank) ** TAIL_EXPONENT;
}

/** Conservative daily downloads at one (real-valued) rank, unrounded. */
export function downloadsAt(popularity: number | null | undefined, rank: number, country: string = "us"): number {
  if (!popularity || popularity <= 0 || rank < 1) return 0;
  return dailySearches(popularity, country || "us") * ttrAt(rank) * CVR;
}

/** Daily downloads at one rank, low and high, unrounded. */
export function rangeAt(popularity: number | null | undefined, rank: number, country: string = "us"): DownloadRange {
  if (!popularity || popularity <= 0 || rank < 1) return { low: 0, high: 0 };
  const estimate = dailySearches(popularity, country || "us") * ttrAt(rank) * CVR;
  return { low: estimate * RANGE_LOW_SHARE, high: estimate };
}

const MEASURED = new Set(STOREFRONT_MARKETS.filter((c) => c.source === "measured").map((c) => c.code));

/** Whether the storefront's market size was measured against App Store data. */
export function isMeasuredMarket(country: string | null | undefined): boolean {
  return MEASURED.has((country || "us").toLowerCase());
}

/** Python's round(x, 2) for display figures. */
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Average of the already-rounded per-position downloads across a tier
 * range, rounded again. Ranges (1-5, 6-10, 11-20) always fall within the
 * fixed 1-20 positions list, so the subset is never empty.
 */
function tierAvg(positions: readonly DownloadPosition[], start: number, end: number): DownloadRange {
  const subset = positions.filter((p) => p.pos >= start && p.pos <= end);
  return {
    low: round2(subset.reduce((sum, p) => sum + p.downloadsLow, 0) / subset.length),
    high: round2(subset.reduce((sum, p) => sum + p.downloadsHigh, 0) / subset.length),
  };
}

/**
 * Estimate daily downloads for each search-result position (1-20) for a
 * keyword. Model: Downloads = Searches × TTR(position) × CVR.
 */
export function estimateDownloads(popularity: number | null, country: string = "us"): DownloadEstimate {
  const searches = dailySearches(popularity, country || "us");

  const positions: DownloadPosition[] = [];
  for (let pos = 1; pos <= 20; pos++) {
    const ttr = TTR[pos - 1];
    const high = searches * ttrAt(pos) * CVR;
    positions.push({
      pos,
      ttr: round2(ttr * 100),
      downloadsLow: round2(high * RANGE_LOW_SHARE),
      downloadsHigh: round2(high),
    });
  }

  return {
    dailySearches: round2(searches),
    positions,
    tiers: {
      top5: tierAvg(positions, 1, 5),
      top6To10: tierAvg(positions, 6, 10),
      top11To20: tierAvg(positions, 11, 20),
    },
    belowThreshold: searches < 1,
    marketSource: isMeasuredMarket(country) ? "measured" : "derived",
  };
}
