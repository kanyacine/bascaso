/* Portions derived from RespectASO (https://github.com/respectlytics/respectaso),
 * aso/scoring.py at 798335f (2026-10-24), AGPL-3.0, Copyright Respectlytics. */

// Single source of truth for opportunity scoring and keyword classification.
// Values must stay bit-identical to the Python reference (see
// tests/unit/aso/parity.test.ts).
//
// Opportunity is what a keyword is worth to THIS app in THIS storefront:
//   rank        = the rank whose taps the app can expect, from the gap between
//                 the keyword's difficulty and the app's strength (or its real
//                 rank when that is the better answer)
//   downloads   = what that rank pays here (./downloads)
//   opportunity = 50 + 20 × log10(downloads per day)
// One download a day scores 50; every tenfold change moves it 20 points.

import { downloadsAt, rangeAt } from "./downloads";
import { keywordTitleEvidence, pyRound } from "./estimators";
import { appStrengthOf, NEW_APP, type AppProfile } from "./strength";

export { dailySearches, popToSearches } from "./downloads";

/** Where the score is asked about: the storefront, the tracked app's profile
 *  there (omitted = a brand new app), its real rank for the keyword here when
 *  known, and the keyword (decides whether that real rank is final). */
export interface OpportunityContext {
  country?: string | null;
  app?: AppProfile | null;
  appRank?: number | null;
  keyword?: string | null;
}

export const OPPORTUNITY_MIDPOINT_DOWNLOADS = 1.0;
export const OPPORTUNITY_POINTS_PER_DECADE = 20.0;

/**
 * The rank model: (gap = difficulty − app strength, effective rank). Measured
 * upstream (rank_calibration_study, 2026-09-22) on 309 searches in six
 * storefronts and 5,846 apps carrying the keyword in their title; each point
 * is the rank whose tap-through equals the average tap-through of the apps
 * at that gap. Log-linear between points, flat below the first, the last
 * segment's slope past the last, up to DEEPEST_RANK.
 */
export const RANK_BY_GAP: ReadonlyArray<readonly [number, number]> = [
  [-37.3, 1.56],
  [-32.6, 1.58],
  [-27.2, 3.09],
  [-22.6, 4.28],
  [-17.4, 5.28],
  [-12.5, 6.22],
  [-7.3, 7.62],
  [-2.3, 10.44],
  [5.2, 13.82],
  [15.0, 16.7],
  [22.5, 17.23],
  [27.4, 17.86],
  [38.8, 23.08],
  [52.5, 31.82],
  [59.0, 47.72],
];
export const DEEPEST_RANK = 250.0;

/**
 * What a person reads: (gap, middle rank, share reaching the top 10) – where
 * the middle app like this one lands, not the effective rank, which the few
 * leaders pull far up. Rank log-linear between points, share linear.
 */
export const TYPICAL_BY_GAP: ReadonlyArray<readonly [number, number, number]> = [
  [-42.5, 1.0, 0.885],
  [-37.3, 1.0, 0.85],
  [-32.5, 1.0, 0.836],
  [-27.4, 4.0, 0.63],
  [-22.4, 13.0, 0.456],
  [-17.5, 16.0, 0.367],
  [-12.5, 21.0, 0.367],
  [-7.3, 31.0, 0.244],
  [-2.4, 42.0, 0.153],
  [2.4, 54.0, 0.088],
  [7.6, 69.0, 0.074],
  [12.6, 78.0, 0.034],
  [17.5, 85.0, 0.034],
  [22.5, 96.0, 0.028],
  [27.5, 98.5, 0.021],
  [32.5, 99.0, 0.004],
  [37.3, 99.0, 0.003],
  [42.5, 103.0, 0.003],
  [47.2, 103.0, 0.003],
  [52.5, 103.0, 0.003],
  [57.1, 123.0, 0.0],
  [61.8, 123.0, 0.0],
];

/** The profile a score uses: the app's, or a brand new app's when there is
 *  no app or its store data has not been read yet. */
function profile(app: AppProfile | null | undefined): AppProfile {
  if (!app || app.known === false) return NEW_APP;
  return app;
}

/** The app's strength, 0-100, with the keyword taken as targeted. */
export function appStrength(app?: AppProfile | null): number {
  return appStrengthOf(profile(app), { targeted: true });
}

const newAppStrength = (): number => appStrengthOf(NEW_APP, { targeted: true });

const clampDifficulty = (difficulty: number | null | undefined) =>
  Math.min(Math.max(difficulty || 0, 0), 100);

/** Whether the app's App Store name already carries the keyword (the exact
 *  phrase, or all of its words). */
export function titleCarries(
  app: AppProfile | null | undefined,
  keyword: string | null | undefined,
): boolean {
  if (!app || !keyword || !app.name) return false;
  const evidence = keywordTitleEvidence(keyword.toLowerCase().trim(), app.name, "");
  return evidence.exactPhrase || evidence.allWords;
}

/** Difficulty as this app experiences it: what is left after its strength
 *  above a brand new app's. */
export function effectiveDifficulty(difficulty: number, app?: AppProfile | null): number {
  const lift = Math.max(0, appStrength(app) - newAppStrength());
  return Math.max(0, clampDifficulty(difficulty) - lift);
}

/** The effective rank at a gap of difficulty minus strength. */
export function rankFromGap(gap: number): number {
  const pts = RANK_BY_GAP;
  if (gap <= pts[0][0]) return pts[0][1];
  if (gap >= pts[pts.length - 1][0]) {
    const [g0, r0] = pts[pts.length - 2];
    const [g1, r1] = pts[pts.length - 1];
    const slope = (Math.log(r1) - Math.log(r0)) / (g1 - g0);
    return Math.min(DEEPEST_RANK, r1 * Math.exp(slope * (gap - g1)));
  }
  for (let i = 1; i < pts.length; i++) {
    const [g0, r0] = pts[i - 1];
    const [g1, r1] = pts[i];
    if (g0 <= gap && gap <= g1) {
      const t = g1 > g0 ? (gap - g0) / (g1 - g0) : 0;
      return Math.exp(Math.log(r0) + t * (Math.log(r1) - Math.log(r0)));
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * The rank whose downloads this app can expect for this keyword here. When
 * its title already carries the keyword, its real rank is the answer; when it
 * does not, the model says what carrying it would bring, and a better real
 * rank wins (an app at #2 is never told it can expect #9).
 */
export function reachableRank(difficulty: number, ctx: OpportunityContext = {}): number {
  const gap = clampDifficulty(difficulty) - appStrength(ctx.app);
  const model = rankFromGap(gap);
  const appRank = ctx.appRank;
  if (appRank && appRank >= 1) {
    if (titleCarries(ctx.app, ctx.keyword)) return appRank;
    return Math.min(model, appRank);
  }
  return model;
}

/** The effective rank, rounded: what the score counts. Not a place to show
 *  for the model's rank (typicalLanding is). */
export function reachablePosition(difficulty: number, ctx: OpportunityContext = {}): number {
  return Math.trunc(reachableRank(difficulty, ctx) + 0.5);
}

/** Where the middle app like this one lands for this keyword with it in its
 *  title, and the share of such apps reaching the top 10. Never better than
 *  the effective rank at the same gap. */
export function typicalLanding(
  difficulty: number,
  app?: AppProfile | null,
): { rank: number; topTenShare: number } {
  const gap = clampDifficulty(difficulty) - appStrength(app);
  const pts = TYPICAL_BY_GAP;
  const last = pts[pts.length - 1];
  let rank = last[1];
  let share = last[2];
  if (gap <= pts[0][0]) {
    rank = pts[0][1];
    share = pts[0][2];
  } else if (gap < last[0]) {
    for (let i = 1; i < pts.length; i++) {
      const [g0, r0, s0] = pts[i - 1];
      const [g1, r1, s1] = pts[i];
      if (g0 <= gap && gap <= g1) {
        const t = g1 > g0 ? (gap - g0) / (g1 - g0) : 0;
        rank = Math.exp(Math.log(r0) * (1 - t) + Math.log(r1) * t);
        share = s0 + (s1 - s0) * t;
        break;
      }
    }
  }
  rank = Math.max(rank, rankFromGap(gap));
  return { rank: Math.max(1, Math.trunc(rank + 0.5)), topTenShare: share };
}

/** Downloads a day this app can expect from this keyword at its effective
 *  rank, unrounded – the single input to the opportunity score. */
export function expectedDownloads(
  popularity: number | null | undefined,
  difficulty: number,
  ctx: OpportunityContext = {},
): number {
  if (!popularity || popularity <= 0) return 0;
  return downloadsAt(popularity, reachableRank(difficulty, ctx), ctx.country || "us");
}

/** The opportunity scale: 50 at one download a day, 20 points a decade. */
export function scoreForDownloads(downloads: number): number {
  if (downloads <= 0) return 0;
  const raw =
    50 + OPPORTUNITY_POINTS_PER_DECADE * Math.log10(downloads / OPPORTUNITY_MIDPOINT_DOWNLOADS);
  return Math.max(0, Math.min(100, pyRound(raw)));
}

/** Opportunity score (0-100): what this keyword is worth to this app here. */
export function calcOpportunity(
  popularity: number | null | undefined,
  difficulty: number,
  ctx: OpportunityContext = {},
): number {
  return scoreForDownloads(expectedDownloads(popularity, difficulty, ctx));
}

/** What the keyword would score for an app holding #1 here: the most it can
 *  be worth to anyone. Tells an empty market from an unreachable one. */
export function topSpotOpportunity(
  popularity: number | null | undefined,
  country?: string | null,
): number {
  if (!popularity || popularity <= 0) return 0;
  return scoreForDownloads(downloadsAt(popularity, 1, country || "us"));
}

export const SWEET_SPOT_SCORE = 70;
export const GOOD_TARGET_SCORE = 50;
export const SUPPORTING_SCORE = 30;
export const REAL_DEMAND_PER_DAY = 1.0;

/** Python round(x, 2) on a display figure. */
const round2 = (x: number) => Math.round(x * 100) / 100;

/** A download figure as the tables print it ("0.4", "5.9", "24", "1.2K"). */
export function fmtDownloads(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n < 1) return n.toFixed(1);
  if (n < 10) return n.toFixed(1).replace(/\.0$/, "");
  return String(pyRound(n));
}

/** A download figure read back as shown, so a bar compared with it never
 *  disagrees with the column next to it. */
export function asShown(perDay: number): number {
  const text = fmtDownloads(perDay);
  return text.endsWith("K") ? Number(text.slice(0, -1)) * 1000 : Number(text);
}

/** Downloads a day at #1, low and high, rounded as the column shows them. */
export function topSpotRange(
  popularity: number | null | undefined,
  country?: string | null,
): { low: number; high: number } {
  if (!popularity || popularity <= 0) return { low: 0, high: 0 };
  const { low, high } = rangeAt(popularity, 1, country || "us");
  return { low: round2(low), high: round2(high) };
}

/** Whether #1 here brings at least one download a day: a fact about the
 *  keyword in this storefront, the same for every app and difficulty. */
export function hasRealDemand(
  popularity: number | null | undefined,
  country?: string | null,
): boolean {
  return asShown(topSpotRange(popularity, country).high) >= REAL_DEMAND_PER_DAY;
}

export const CLASSIFICATION_LABELS = [
  "Sweet Spot",
  "Good Target",
  "Supporting",
  "Worth Climbing",
  "Low Volume",
] as const;

export type ClassificationLabel = (typeof CLASSIFICATION_LABELS)[number];

/**
 * Classify a keyword: what to do with it, for this app or a new app.
 *
 *   Low Volume      #1 brings under 1 download a day
 *   Sweet Spot      the app can expect 10+ a day (opportunity 70+)
 *   Good Target     1 to 10 a day (50-69)
 *   Supporting      one every 10 days to 1 a day (30-49)
 *   Worth Climbing  less than that today, but #1 brings 1+ a day
 *
 * Demand is decided first, from the keyword alone.
 */
export function classifyKeyword(
  popularity: number,
  difficulty: number,
  ctx: OpportunityContext = {},
): ClassificationLabel {
  if (!hasRealDemand(popularity, ctx.country)) return "Low Volume";
  const opportunity = calcOpportunity(popularity, difficulty, ctx);
  if (opportunity >= SWEET_SPOT_SCORE) return "Sweet Spot";
  if (opportunity >= GOOD_TARGET_SCORE) return "Good Target";
  if (opportunity >= SUPPORTING_SCORE) return "Supporting";
  return "Worth Climbing";
}
