// Ported from respectaso aso/services.py – DownloadEstimator (lines
// ~984-1215). Estimates daily downloads per ranking position for a
// keyword by combining popularity → daily searches, position → tap-through
// rate (TTR), and a conversion-rate (tap → install) range. Parity is
// enforced by tests/unit/aso/downloads.test.ts against vectors in
// tests/unit/aso/parity-vectors.json (download_cases).

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
}

// Popularity score → estimated daily searches (US App Store baseline).
// Piecewise-linear mapping calibrated against real App Store observations.
const POP_TO_SEARCHES: ReadonlyArray<readonly [number, number]> = [
  [5, 1],
  [10, 3],
  [15, 5],
  [20, 10],
  [25, 20],
  [30, 35],
  [35, 55],
  [40, 90],
  [45, 140],
  [50, 200],
  [55, 290],
  [60, 400],
  [65, 550],
  [70, 750],
  [75, 1_100],
  [80, 2_000],
  [85, 4_000],
  [90, 8_000],
  [95, 16_000],
  [100, 32_000],
];

// Position → tap-through rate (fraction of searchers who tap), index 0 =
// position 1, index 19 = position 20. Power-law decay: steep drop from #1
// to #5 (first screen), then a gradual tail for positions requiring scroll.
const TTR: readonly number[] = [
  0.3, 0.18, 0.12, 0.085, 0.06, 0.045, 0.033, 0.025, 0.019, 0.013, 0.009, 0.007, 0.0055, 0.0042,
  0.0033, 0.0025, 0.0019, 0.0014, 0.001, 0.0007,
];

// Conversion rate (tap → install) range for free apps.
const CVR_LOW = 0.05;
const CVR_HIGH = 0.2;

// Market-size multiplier: scales search volume relative to the US App
// Store (the POP_TO_SEARCHES baseline). Derived from estimated
// active-iPhone installed base per country relative to the US.
const MARKET_SIZE: Readonly<Record<string, number>> = {
  us: 1.0,
  // Tier 2 – large markets (30 M+ iPhones)
  cn: 0.45,
  jp: 0.35,
  gb: 0.3,
  de: 0.25,
  fr: 0.22,
  kr: 0.2,
  br: 0.18,
  in: 0.15,
  ca: 0.15,
  au: 0.12,
  ru: 0.12,
  it: 0.12,
  es: 0.1,
  mx: 0.1,
  // Tier 3 – mid-size markets (5-30 M iPhones)
  tw: 0.08,
  nl: 0.07,
  se: 0.06,
  ch: 0.06,
  pl: 0.05,
  tr: 0.05,
  th: 0.05,
  id: 0.05,
  be: 0.04,
  at: 0.04,
  no: 0.04,
  dk: 0.04,
  sg: 0.04,
  il: 0.04,
  ae: 0.04,
  sa: 0.04,
  ph: 0.04,
  my: 0.04,
  za: 0.03,
  ie: 0.03,
  fi: 0.03,
  pt: 0.03,
  nz: 0.03,
  cl: 0.03,
  ar: 0.03,
  co: 0.03,
  ng: 0.03,
  eg: 0.03,
  pk: 0.02,
  ke: 0.02,
  gh: 0.02,
  tz: 0.02,
  ug: 0.02,
};
const MARKET_SIZE_DEFAULT = 0.03;

/** Interpolate daily search volume from a popularity score (5-100). */
function dailySearches(popularity: number | null): number {
  if (popularity === null || popularity <= 0) return 0;
  const pts = POP_TO_SEARCHES;
  if (popularity <= pts[0][0]) return pts[0][1] * (popularity / pts[0][0]);
  if (popularity >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  let i = 1;
  while (popularity > pts[i][0]) i++;
  const [p0, s0] = pts[i - 1];
  const [p1, s1] = pts[i];
  return s0 + ((popularity - p0) / (p1 - p0)) * (s1 - s0);
}

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
  let searches = dailySearches(popularity);

  // Scale search volume by relative App Store market size; unknown
  // country codes fall back to a conservative default factor.
  const marketMult = MARKET_SIZE[(country || "us").toLowerCase()] ?? MARKET_SIZE_DEFAULT;
  searches *= marketMult;

  const positions: DownloadPosition[] = [];
  for (let pos = 1; pos <= 20; pos++) {
    const ttr = TTR[pos - 1];
    positions.push({
      pos,
      ttr: round2(ttr * 100),
      downloadsLow: round2(searches * ttr * CVR_LOW),
      downloadsHigh: round2(searches * ttr * CVR_HIGH),
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
  };
}
