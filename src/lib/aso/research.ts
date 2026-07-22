// Pure helpers for the "Recherche ASO" tab: input parsing, keyword merging,
// App Store Connect field editing, result-table sorting, and market signals.

import type { DifficultyBreakdown, RankingTier } from "@/lib/aso/estimators";
import { normalizeKeyword, type ScoreTone } from "@/lib/aso/score-display";
import type { TagScore } from "@/components/keyword-tag-input";

const ASC_FIELD_MAX_LENGTH = 100;

/** ASC app id as a numeric Apple id for rank lookups; demo apps have
 *  non-numeric ids and return undefined (rank stays unavailable). */
export function numericAppleId(id: string | undefined): number | undefined {
  const appleId = Number(id);
  return Number.isInteger(appleId) && appleId > 0 ? appleId : undefined;
}

/** Splits a free-form textarea/paste into normalized, deduped keywords. */
export function parseResearchInput(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const piece of input.split(/[,\n]/)) {
    const normalized = normalizeKeyword(piece);
    if (!normalized || normalized.length > ASC_FIELD_MAX_LENGTH) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/** Appends keywords from `added` that aren't already in `existing` (both already normalized). */
export function mergeKeywords(existing: string[], added: string[]): string[] {
  const seen = new Set(existing);
  const result = [...existing];
  for (const keyword of added) {
    if (seen.has(keyword)) continue;
    seen.add(keyword);
    result.push(keyword);
  }
  return result;
}

/**
 * Appends a keyword to an App Store Connect keywords field (comma-separated,
 * 100-char hard limit). Returns null if the keyword is already present
 * (entry-wise, trim + lowercase) or if appending would exceed the limit.
 */
export function appendKeywordToField(field: string, keyword: string): string | null {
  const entries = field.split(",").map((entry) => entry.trim().toLowerCase());
  if (entries.includes(keyword.trim().toLowerCase())) return null;

  const candidate = field.trim() === "" ? keyword : `${field},${keyword}`;
  if (candidate.length > ASC_FIELD_MAX_LENGTH) return null;
  return candidate;
}

// ── Opportunity signals (respectaso services.py _find_opportunities) ─────

export type OpportunityKey =
  | "titleGapNone"
  | "titleGapFew"
  | "weakCompetitors"
  | "activeMarket"
  | "crossGenre";

export interface Opportunity {
  key: OpportunityKey;
  /** Mirrors respectaso's "Strong" / "Moderate" signal strength. */
  strength: "strong" | "moderate";
  tone: ScoreTone;
  params: Record<string, string | number>;
}

/** Minimal competitor shape the signals read – `CompetitorSnapshot` fits. */
interface OpportunityApp {
  trackName?: string;
  userRatingCount?: number;
  averageUserRating?: number;
  releaseDate?: string;
  primaryGenreName?: string;
}

const WEAK_REVIEW_THRESHOLD = 1_000;
const FRESH_DAYS = 365;
const DAY_MS = 86_400_000;

/**
 * Actionable opportunity signals for a keyword, ported from respectaso's
 * `_find_opportunities`. Reads the same competitor list the difficulty was
 * computed from; prose lives in i18n, only the thresholds live here.
 */
export function deriveOpportunities(
  breakdown: DifficultyBreakdown,
  competitors: OpportunityApp[],
  now: Date = new Date(),
): Opportunity[] {
  const n = competitors.length;
  if (n === 0) return [];
  const signals: Opportunity[] = [];

  // `titleMatchCount` is counted over the full scored result set, which can be
  // wider than a truncated legacy snapshot – clamping keeps the ratio honest.
  const matches = Math.min(breakdown.titleMatchCount, n);
  if (matches === 0) {
    signals.push({ key: "titleGapNone", strength: "strong", tone: "green", params: {} });
  } else if (matches <= Math.floor(n / 3)) {
    signals.push({
      key: "titleGapFew",
      strength: "moderate",
      tone: "lightGreen",
      params: { count: matches, total: n },
    });
  }

  const weak = competitors.filter(
    (c) => (c.userRatingCount ?? 0) < WEAK_REVIEW_THRESHOLD,
  );
  if (weak.length > 0) {
    const weakest = weak.reduce((min, c) =>
      (c.userRatingCount ?? 0) < (min.userRatingCount ?? 0) ? c : min,
    );
    signals.push({
      key: "weakCompetitors",
      strength: weak.length >= 3 ? "strong" : "moderate",
      tone: "green",
      params: {
        count: weak.length,
        total: n,
        name: weakest.trackName || "–",
        reviews: weakest.userRatingCount ?? 0,
      },
    });
  }

  const fresh = competitors.filter((c) => {
    if (!c.releaseDate) return false;
    const released = new Date(c.releaseDate);
    if (Number.isNaN(released.getTime())) return false;
    return Math.floor((now.getTime() - released.getTime()) / DAY_MS) < FRESH_DAYS;
  });
  if (fresh.length > 0) {
    signals.push({
      key: "activeMarket",
      strength: "moderate",
      tone: "blue",
      params: { count: fresh.length, total: n },
    });
  }

  const genres = [
    ...new Set(competitors.map((c) => c.primaryGenreName).filter(Boolean)),
  ].sort() as string[];
  if (genres.length >= 3) {
    signals.push({
      key: "crossGenre",
      strength: "moderate",
      tone: "blue",
      params: {
        count: genres.length,
        genres: genres.slice(0, 3).join(", ") + (genres.length > 3 ? "…" : ""),
      },
    });
  }

  return signals;
}

// ── Insights (respectaso services.py _generate_insights + overrides) ─────

export type InsightKey =
  | "adjustedSmall"
  | "adjustedCompetitive"
  | "adjustedBackfill"
  | "brandKeyword"
  | "incumbentsUltra"
  | "incumbentsMega"
  | "skewedGiants"
  | "titleGapNone"
  | "titleGapFew"
  | "titleCrowded"
  | "qualityBar"
  | "weakCompetitors";

export interface Insight {
  key: InsightKey;
  tone: ScoreTone;
  params: Record<string, string | number>;
}

/** Review-weighted average star rating, as in `_compute_raw_difficulty`. */
function weightedRating(competitors: OpportunityApp[]): number {
  let sum = 0;
  let weight = 0;
  for (const c of competitors) {
    const rating = c.averageUserRating ?? 0;
    const reviews = c.userRatingCount ?? 0;
    if (rating > 0 && reviews > 0) {
      const w = Math.log1p(reviews);
      sum += rating * w;
      weight += w;
    }
  }
  return weight > 0 ? sum / weight : 0;
}

/**
 * Human-readable notes explaining a score, ported from respectaso's
 * `_generate_insights` plus the brand and score-override notes it prepends.
 * Counts come from the stored competitor snapshot, so a truncated legacy row
 * yields smaller – never wrong – numbers.
 */
export function deriveInsights(
  breakdown: DifficultyBreakdown,
  competitors: OpportunityApp[],
): Insight[] {
  const n = competitors.length;
  const insights: Insight[] = [];
  if (n === 0) return insights;

  const leader = competitors[0];
  const leaderName = leader.trackName || "–";
  const leaderReviews = leader.userRatingCount ?? 0;
  const matches = Math.min(breakdown.titleMatchCount, n);

  // Score override – only when it actually moved the score.
  if (breakdown.overrideReason && breakdown.rawTotal !== breakdown.totalScore) {
    const shared = { from: breakdown.rawTotal, to: breakdown.totalScore };
    if (breakdown.overrideReason === "small_result_set") {
      insights.push({ key: "adjustedSmall", tone: "green", params: { ...shared, count: n } });
    } else if (matches / n > 0.3) {
      insights.push({
        key: "adjustedCompetitive",
        tone: "green",
        params: { ...shared, name: leaderName, reviews: leaderReviews, count: matches, total: n },
      });
    } else {
      insights.push({
        key: "adjustedBackfill",
        tone: "green",
        params: { ...shared, name: leaderName, reviews: leaderReviews },
      });
    }
  }

  if (breakdown.isBrandKeyword) {
    insights.push({
      key: "brandKeyword",
      tone: "blue",
      params: { brand: breakdown.brandName ?? "–", name: leaderName },
    });
  }

  // Incumbents, counted over the leading half of the results.
  const ratingCounts = competitors.map((c) => c.userRatingCount ?? 0);
  const topHalf = ratingCounts.slice(0, Math.max(Math.floor(n / 2), 1));
  const ultra = topHalf.filter((r) => r > 1_000_000).length;
  const mega = topHalf.filter((r) => r > 100_000).length;
  if (ultra > 0) {
    insights.push({ key: "incumbentsUltra", tone: "red", params: { count: ultra } });
  } else if (mega > 0) {
    insights.push({ key: "incumbentsMega", tone: "orange", params: { count: mega } });
  }

  if (
    breakdown.avgReviews > 0 &&
    breakdown.medianReviews > 0 &&
    breakdown.avgReviews > breakdown.medianReviews * 3
  ) {
    insights.push({
      key: "skewedGiants",
      tone: "blue",
      params: { median: breakdown.medianReviews, avg: breakdown.avgReviews },
    });
  }

  if (matches === 0) {
    insights.push({ key: "titleGapNone", tone: "green", params: {} });
  } else if (matches <= 2) {
    insights.push({ key: "titleGapFew", tone: "green", params: { count: matches, total: n } });
  } else {
    insights.push({ key: "titleCrowded", tone: "orange", params: { count: matches, total: n } });
  }

  const quality = weightedRating(competitors);
  if (quality >= 4.5) {
    insights.push({
      key: "qualityBar",
      tone: "orange",
      params: { rating: Math.round(quality * 10) / 10 },
    });
  }

  const weak = ratingCounts.filter((r) => r < WEAK_REVIEW_THRESHOLD).length;
  if (weak >= 3) {
    insights.push({ key: "weakCompetitors", tone: "green", params: { count: weak, total: n } });
  }

  return insights;
}

// ── Competitor title highlighting (respectaso dashboard highlightKeyword) ─

export type HighlightTier = "exact" | "all" | "partial";

export interface TitleHighlight {
  /** null when nothing in the title matches. */
  tier: HighlightTier | null;
  segments: { text: string; match: boolean }[];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits a competitor title into matched / unmatched segments. Mirrors
 * respectaso: an exact phrase wins, otherwise every keyword word present is
 * highlighted, and the tier says how complete the match is.
 */
export function highlightTitle(title: string, keyword: string): TitleHighlight {
  const words = keyword.trim().split(/\s+/).filter(Boolean);
  if (title === "" || words.length === 0) return { tier: null, segments: [{ text: title, match: false }] };

  const titleLower = title.toLowerCase();
  const phrase = keyword.trim().toLowerCase();
  const present = words.filter((w) => titleLower.includes(w.toLowerCase()));

  let tier: HighlightTier;
  let needles: string[];
  if (words.length > 1 && titleLower.includes(phrase)) {
    tier = "exact";
    needles = [keyword.trim()];
  } else if (present.length === 0) {
    return { tier: null, segments: [{ text: title, match: false }] };
  } else {
    tier = words.length === 1 ? "exact" : present.length === words.length ? "all" : "partial";
    needles = present;
  }

  // One capturing group, so split() puts the matches at the odd indices.
  const pattern = new RegExp(`(${needles.map(escapeRegExp).join("|")})`, "gi");
  const segments = title
    .split(pattern)
    .map((text, i) => ({ text, match: i % 2 === 1 }))
    .filter(({ text }) => text !== "");

  return { tier, segments };
}

// ── Ranking tier highlights (respectaso services.py _tier_highlights) ────

export type TierHighlightKey =
  | "tierNoCompetitors"
  | "tierOpenSpots"
  | "tierReviewsEasiest"
  | "tierReviewsNeeded"
  | "tierReviewsBreakIn"
  | "tierReviewsEstablished"
  | "tierWeakBeatable"
  | "tierNoEasyTargets"
  | "tierFreshEntrants"
  | "tierTitleNone"
  | "tierTitleFew"
  | "tierTitleMany";

export interface TierHighlight {
  key: TierHighlightKey;
  params: Record<string, string | number>;
}

/**
 * Plain-language bullets for one ranking tier card, ported from respectaso's
 * `_tier_highlights`. Every input is already stored on the tier, so no
 * rescoring is involved.
 */
export function tierHighlights(tier: RankingTier, tierSize: number): TierHighlight[] {
  const n = tier.totalApps;
  if (n === 0) return [{ key: "tierNoCompetitors", params: {} }];
  if (n < tierSize) {
    return [{ key: "tierOpenSpots", params: { count: n, size: tierSize, open: tierSize - n } }];
  }

  const highlights: TierHighlight[] = [];
  const min = tier.minReviews;
  if (min < 100) {
    highlights.push({ key: "tierReviewsEasiest", params: { count: min } });
  } else if (min < 1_000) {
    highlights.push({ key: "tierReviewsNeeded", params: { count: min, name: tier.weakestApp || "–" } });
  } else if (min < 10_000) {
    highlights.push({ key: "tierReviewsBreakIn", params: { count: min } });
  } else {
    highlights.push({ key: "tierReviewsEstablished", params: { count: min } });
  }

  highlights.push(
    tier.weakCount > 0
      ? { key: "tierWeakBeatable", params: { count: tier.weakCount, total: n } }
      : { key: "tierNoEasyTargets", params: {} },
  );

  if (tier.freshCount > 0) {
    highlights.push({ key: "tierFreshEntrants", params: { count: tier.freshCount, total: n } });
  }

  const titled = tier.titleKeywordCount;
  if (titled === 0) {
    highlights.push({ key: "tierTitleNone", params: {} });
  } else if (titled < Math.floor(n / 2)) {
    highlights.push({ key: "tierTitleFew", params: { count: titled, total: n } });
  } else {
    highlights.push({ key: "tierTitleMany", params: { count: titled, total: n } });
  }

  return highlights;
}

export interface ScoreDelta {
  /** Numeric direction of the change. */
  direction: "up" | "down";
  /** Whether the change is good news for this keyword as a target. */
  improved: boolean;
  amount: number;
}

/** Change between the current value and the previous observation; null
 *  when either value is missing or nothing changed. */
export function scoreDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  lowerIsBetter = false,
): ScoreDelta | null {
  if (current == null || previous == null || current === previous) return null;
  return {
    direction: current > previous ? "up" : "down",
    improved: lowerIsBetter ? current < previous : current > previous,
    amount: Math.abs(current - previous),
  };
}

export type ResearchSortColumn =
  | "keyword"
  | "popularity"
  | "difficulty"
  | "opportunity"
  | "classification"
  | "results"
  | "rank";

// Verdict quality order, worst to best – index is the sort value.
const CLASSIFICATION_ORDER = [
  "Avoid",
  "High Competition",
  "Low Volume",
  "Moderate",
  "Good Target",
  "Hidden Gem",
  "Sweet Spot",
];

export interface ResearchRow {
  keyword: string;
  score?: TagScore;
}

type NumericColumn = Exclude<ResearchSortColumn, "keyword">;

/** Extracts a sortable numeric value; null covers "no value" (not done, or null field). */
function numericValue(row: ResearchRow, column: NumericColumn): number | null {
  const score = row.score;
  if (!score || score.status !== "done") return null;
  if (column === "popularity") return score.popularity;
  if (column === "difficulty") return score.difficulty;
  if (column === "opportunity") return score.opportunity;
  if (column === "classification")
    return CLASSIFICATION_ORDER.indexOf(score.classification);
  if (column === "results") return score.resultCount ?? null;
  // column === "rank": rank 1 is best, so plain ascending numeric order is
  // already "best first" – no inversion needed here.
  return score.rank ?? null;
}

export function compareResearchRows(
  column: ResearchSortColumn,
  dir: "asc" | "desc",
): (a: ResearchRow, b: ResearchRow) => number {
  return (a, b) => {
    if (column === "keyword") {
      const cmp = a.keyword.localeCompare(b.keyword);
      return dir === "asc" ? cmp : -cmp;
    }

    const aValue = numericValue(a, column);
    const bValue = numericValue(b, column);

    // Rows without a value always sort last, regardless of direction.
    if (aValue === null && bValue === null) return a.keyword.localeCompare(b.keyword);
    if (aValue === null) return 1;
    if (bValue === null) return -1;

    if (aValue === bValue) return a.keyword.localeCompare(b.keyword);
    const cmp = aValue - bValue;
    return dir === "asc" ? cmp : -cmp;
  };
}
