/* Portions derived from RespectASO (https://github.com/respectlytics/respectaso),
 * aso/strength.py at 798335f (2026-10-24), AGPL-3.0, Copyright Respectlytics. */

// How strong an app is: one yardstick for the competitors and for your app.
// Difficulty measures how strong the apps already ranking for a keyword are;
// the opportunity score needs to know how strong YOUR app is, to say where it
// would land among them. Both use the same factor curves and weights:
//
//   factor          curve           in difficulty   per app
//   rating volume   volumeScore     30%             yes
//   momentum        momentumScore   10%             yes (ratings per year)
//   rating          ratingScore     10%             yes (average stars)
//   age             ageScore        10%             yes (years on the store)
//   title match     titleScore      10%             yes
//   dominant players                20%             field only
//   publisher diversity             10%             field only
//
// Every curve is continuous, so no input change makes a score jump.

type Bands = ReadonlyArray<readonly [number, number]>;

/** Log interpolation between calibration points, linear from 0 to the first
 *  point, and the last point's value at and beyond it. */
function logBands(value: number, bands: Bands): number {
  if (value <= 0) return 0;
  const [lastThreshold, lastScore] = bands[bands.length - 1];
  if (value >= lastThreshold) return lastScore;
  for (let i = 0; i < bands.length; i++) {
    const [threshold, score] = bands[i];
    if (value < threshold) {
      if (i === 0) return (value / threshold) * score;
      const [prevThreshold, prevScore] = bands[i - 1];
      const ratio = Math.log(value / prevThreshold) / Math.log(threshold / prevThreshold);
      return prevScore + ratio * (score - prevScore);
    }
  }
  return lastScore;
}

/** Linear interpolation between calibration points, clamped at the ends. */
function linearBands(value: number, bands: Bands): number {
  if (value <= bands[0][0]) return bands[0][1];
  if (value >= bands[bands.length - 1][0]) return bands[bands.length - 1][1];
  for (let i = 1; i < bands.length; i++) {
    const [threshold, score] = bands[i];
    if (value < threshold) {
      const [prevThreshold, prevScore] = bands[i - 1];
      const ratio = (value - prevThreshold) / (threshold - prevThreshold);
      return prevScore + ratio * (score - prevScore);
    }
  }
  return bands[bands.length - 1][1];
}

// ── the factor curves ──────────────────────────────────────────────────────

/** Rating count → 0-100: 50 → 5, 500 → 30, 2,000 → 50, 10,000 → 78, 1M → 100. */
export const VOLUME_BANDS: Bands = [
  [50, 5], [200, 15], [500, 30], [2_000, 50], [5_000, 65],
  [10_000, 78], [25_000, 88], [100_000, 95], [1_000_000, 100],
];

/** Ratings per year → 0-100: 10 → 5, 1,000 → 50, 50,000 → 95, 500,000 → 100. */
export const MOMENTUM_BANDS: Bands = [
  [10, 5], [50, 15], [200, 30], [1_000, 50], [5_000, 70],
  [20_000, 85], [50_000, 95], [500_000, 100],
];

/** Average stars → 0-100: 3.0 → 20, 4.0 → 50, 4.5 → 85, 5.0 → 100. */
export const RATING_BANDS: Bands = [
  [0.0, 0], [3.0, 20], [3.5, 35], [4.0, 50], [4.3, 70], [4.5, 85], [5.0, 100],
];

/** Years on the store → 0-100: half a year → 10, 3 → 50, 10 → 100. */
export const AGE_BANDS: Bands = [
  [0.5, 10], [1.0, 20], [2.0, 35], [3.0, 50], [5.0, 70], [8.0, 85], [10.0, 100],
];

/** A new app's ratings per year are measured over at least half a year. */
export const MIN_MOMENTUM_YEARS = 0.5;

export function volumeScore(ratings: number | null | undefined): number {
  return logBands(ratings || 0, VOLUME_BANDS);
}

export function momentumScore(ratingsPerYear: number | null | undefined): number {
  return logBands(ratingsPerYear || 0, MOMENTUM_BANDS);
}

export function ratingScore(averageStars: number | null | undefined): number {
  if (!averageStars || averageStars <= 0) return 0;
  return linearBands(averageStars, RATING_BANDS);
}

export function ageScore(years: number | null | undefined): number {
  if (years == null || years <= 0) return 0;
  const [firstThreshold, firstScore] = AGE_BANDS[0];
  if (years < firstThreshold) return (years / firstThreshold) * firstScore;
  return linearBands(years, AGE_BANDS);
}

/** How strongly a title targets the keyword, 0-100, from graded title evidence
 *  (exact phrase 1.0, all words high, partial overlap low). */
export function titleScore(evidence: number | null | undefined): number {
  return 100 * Math.max(0, Math.min(1, evidence || 0));
}

const DAY_MS = 86_400_000;

/** Years on the store from an ISO date string (whole days / 365.25, like
 *  Python's `timedelta.days`). */
export function yearsSince(
  released: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!released) return null;
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(released);
  const ms = Date.parse(hasZone || !released.includes("T") ? released : `${released}Z`);
  if (Number.isNaN(ms)) return null;
  const days = Math.floor((now.getTime() - ms) / DAY_MS);
  return Math.max(0, days / 365.25);
}

export function ratingsPerYear(ratings: number | null | undefined, years: number | null): number {
  if (!ratings || ratings <= 0 || years == null) return 0;
  return ratings / Math.max(MIN_MOMENTUM_YEARS, years);
}

// ── the weights ────────────────────────────────────────────────────────────

export const STRENGTH_WEIGHTS = {
  volume: 0.3,
  momentum: 0.1,
  dominance: 0.2,
  rating: 0.1,
  age: 0.1,
  publishers: 0.1,
  title: 0.1,
} as const;

export const PER_APP_FACTORS = ["volume", "momentum", "rating", "age", "title"] as const;
export type PerAppFactor = (typeof PER_APP_FACTORS)[number];

const PER_APP_TOTAL = PER_APP_FACTORS.reduce((sum, f) => sum + STRENGTH_WEIGHTS[f], 0);

// ── one app ────────────────────────────────────────────────────────────────

/** What the App Store shows about one app in one storefront. `ratings` and
 *  `average` are that storefront's own figures; `released` is the first
 *  release date. Missing fields read as a brand new app's. `known: false`
 *  means the app is named but its store data has not been read here yet: it
 *  then scores as a brand new app. */
export interface AppProfile {
  name?: string | null;
  ratings?: number;
  average?: number | null;
  released?: string | null;
  known?: boolean;
}

export const NEW_APP: AppProfile = Object.freeze({});

export interface StrengthOptions {
  /** Take the title factor as 100 (the keyword would be in the title). */
  targeted?: boolean;
  /** Graded title evidence, used when `targeted` is false. */
  titleEvidence?: number | null;
  now?: Date;
}

/** The five per-app factors, each 0-100, on the difficulty curves. */
export function appComponents(
  app: AppProfile,
  { targeted = true, titleEvidence = null, now }: StrengthOptions = {},
): Record<PerAppFactor, number> {
  const known = app.known ?? true;
  const years = known ? yearsSince(app.released, now) : null;
  const ratings = known ? app.ratings || 0 : 0;
  const evidence = targeted ? 1 : titleEvidence || 0;
  return {
    volume: volumeScore(ratings),
    momentum: momentumScore(ratingsPerYear(ratings, years)),
    rating: ratings > 0 ? ratingScore(app.average || 0) : 0,
    age: years != null ? ageScore(years) : 0,
    title: titleScore(evidence),
  };
}

/** 0-100 on the same scale as difficulty's per-app factors. */
export function appStrengthOf(app: AppProfile, options?: StrengthOptions): number {
  const parts = appComponents(app, options);
  return PER_APP_FACTORS.reduce((sum, f) => sum + STRENGTH_WEIGHTS[f] * parts[f], 0) / PER_APP_TOTAL;
}

/** From an iTunes search or lookup result. */
export function profileFromResult(app: {
  trackName?: string;
  userRatingCount?: number;
  averageUserRating?: number;
  releaseDate?: string;
}): AppProfile {
  return {
    name: app.trackName ?? null,
    ratings: Math.trunc(app.userRatingCount || 0),
    average: app.averageUserRating ?? null,
    released: app.releaseDate ?? null,
  };
}
