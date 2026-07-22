// Ported from respectaso aso/services.py – PopularityEstimator,
// DifficultyCalculator and their shared title-evidence helpers. Every
// numeric path mirrors the Python reference; parity is enforced by
// tests/unit/aso/parity.test.ts and tests/unit/aso/ranking-tiers.test.ts
// against vectors generated from the original code
// (scripts/gen-aso-parity-vectors.py).
// ponytail: insights, opportunity signals and download estimates are not
// ported – the keyword badge only needs the scores. Ranking tiers (top
// 5/10/20 difficulty) ARE ported, but their `highlights` field (English
// prose bullets) is intentionally not – the badge only needs the numbers.

/** App dict shape produced by the iTunes Search API (subset we score on). */
export interface CompetitorApp {
  trackId?: number;
  trackName?: string;
  artworkUrl100?: string;
  userRatingCount?: number;
  averageUserRating?: number;
  releaseDate?: string;
  currentVersionReleaseDate?: string;
  primaryGenreName?: string;
  sellerName?: string;
  bundleId?: string;
  formattedPrice?: string;
  description?: string;
  trackViewUrl?: string;
}

// ── Tokenization and title evidence ──────────────────────────────────────

const FINANCE_INTENT_TOKENS = new Set([
  "option", "options", "trading", "trade", "stock", "stocks",
  "call", "put", "signal", "signals", "invest", "investing",
]);

const FINANCE_STRONG_CONTEXT_TOKENS = new Set([
  "finance", "financial", "stock", "stocks", "trading", "trade",
  "portfolio", "broker", "invest", "investing", "market", "markets",
  "futures", "derivative", "derivatives", "forex", "etf",
]);

const TOKEN_NORMALIZATION: Record<string, string> = {
  options: "option",
  stocks: "stock",
  signals: "signal",
  markets: "market",
};

/** Tokenize into lowercase words (Unicode letters/digits, no underscore). */
function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return raw.map((tok) => TOKEN_NORMALIZATION[tok] ?? tok);
}

interface TitleEvidence {
  exactPhrase: boolean;
  allWords: boolean;
  partialOverlap: number;
  proximity: number;
  evidence: number;
}

/** Match hierarchy: exact phrase > all words (any order) > partial overlap. */
function keywordTitleEvidence(
  keyword: string,
  title: string,
  genre: string,
): TitleEvidence {
  const kw = keyword.toLowerCase().trim();
  const titleLower = title.toLowerCase();
  const kwTokens = new Set(tokenize(kw));
  const titleTokensList = tokenize(titleLower);
  const titleTokens = new Set(titleTokensList);

  if (kwTokens.size === 0 || titleTokens.size === 0) {
    return { exactPhrase: false, allWords: false, partialOverlap: 0, proximity: 0, evidence: 0 };
  }

  let exactPhrase = kw !== "" && titleLower.includes(kw);
  let allWords = [...kwTokens].every((tok) => titleTokens.has(tok));
  let overlap =
    [...kwTokens].filter((tok) => titleTokens.has(tok)).length / kwTokens.size;

  // Proximity rewards compact all-word matches while still accepting
  // reverse order and words-in-between as strong evidence.
  let proximity = 0;
  if (allWords && kwTokens.size > 1) {
    const positions = [...kwTokens].map((tok) => titleTokensList.indexOf(tok));
    const span = Math.max(1, Math.max(...positions) - Math.min(...positions) + 1);
    proximity = Math.min(1, kwTokens.size / span);
  }

  // Ambiguity guard: finance-intent keywords should not get strong
  // relevance from non-finance titles (e.g. generic "call" apps).
  const financeIntent = [...kwTokens].some((tok) => FINANCE_INTENT_TOKENS.has(tok));
  const financeContext =
    genre.toLowerCase().includes("finance") ||
    titleTokensList.some((tok) => FINANCE_STRONG_CONTEXT_TOKENS.has(tok));
  if (financeIntent && !financeContext && (exactPhrase || allWords)) {
    exactPhrase = false;
    allWords = false;
    overlap = Math.min(overlap, 0.5);
  }
  if (financeIntent && !financeContext && !(exactPhrase || allWords)) {
    overlap = 0;
  }

  let strongScore = 0;
  if (exactPhrase) strongScore = 1;
  else if (allWords) strongScore = 0.85 + 0.15 * proximity;

  let partialScore = 0;
  if (!exactPhrase && !allWords && overlap > 0) {
    partialScore = Math.min(0.5, overlap * 0.5);
  }

  return {
    exactPhrase,
    allWords,
    partialOverlap: overlap,
    proximity,
    evidence: Math.max(strongScore, partialScore),
  };
}

/**
 * Detect whether a keyword is a brand/company name, using signals from the
 * search results: seller-name match (required) plus, for weak leaders,
 * review disparity in positions #2-5.
 */
function isBrandKeyword(
  keyword: string,
  leader: CompetitorApp,
  competitors: CompetitorApp[],
): { isBrand: boolean; brandName: string | null } {
  const none = { isBrand: false, brandName: null };
  const kwTokens = new Set(tokenize(keyword));
  if (kwTokens.size === 0) return none;

  const seller = leader.sellerName ?? "";
  const sellerTokens = new Set(tokenize(seller));
  if (sellerTokens.size === 0) return none;

  // Signal A: every keyword token appears in the seller name
  if (![...kwTokens].every((tok) => sellerTokens.has(tok))) return none;

  // For strong leaders, seller-name match alone is definitive.
  if ((leader.userRatingCount ?? 0) >= 1_000) return { isBrand: true, brandName: seller };

  // Signal B: weak leader – also require a strong independent field behind it.
  const leaderSellerLower = seller.trim().toLowerCase();
  const independent = competitors
    .slice(1)
    .filter((c) => (c.sellerName ?? "").trim().toLowerCase() !== leaderSellerLower)
    .slice(0, 4);
  if (independent.length === 0) return none;
  if (median(independent.map((c) => c.userRatingCount ?? 0)) < 10_000) return none;

  return { isBrand: true, brandName: seller };
}

// ── Shared numeric helpers ───────────────────────────────────────────────

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 1
    ? sorted[(n - 1) / 2]
    : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

type Band = readonly [number, number];

// Interpolate between calibration bands. i=0 ramps linearly from zero;
// call sites guarantee value < top band threshold (guards handle the caps).
function bandScore(value: number, bands: readonly Band[], scale: "log" | "linear"): number {
  const i = bands.findIndex(([threshold]) => value < threshold);
  const [threshold, score] = bands[i];
  if (i === 0) return (value / threshold) * score;
  const [prevT, prevS] = bands[i - 1];
  const ratio =
    scale === "log"
      ? Math.log(value / prevT) / Math.log(threshold / prevT)
      : (value - prevT) / (threshold - prevT);
  return prevS + ratio * (score - prevS);
}

const round1 = (x: number) => Math.round(x * 10) / 10;

// ── Popularity estimator ─────────────────────────────────────────────────

const LEADER_BANDS: readonly Band[] = [
  [10, 1], [100, 5], [1_000, 10], [10_000, 17], [100_000, 24], [1_000_000, 30],
];

const DEPTH_BANDS: readonly Band[] = [
  [10, 0.5], [100, 3], [1_000, 5], [10_000, 8], [50_000, 10],
];

// Keyword specificity penalty per word count (1→0, 6+→-28). Word counts are
// integers, so the Python interpolation reduces to a lookup.
const SPECIFICITY_PENALTY: Record<number, number> = { 2: -3, 3: -8, 4: -15, 5: -22 };

/**
 * Estimate keyword search popularity (5-100) from iTunes competitor data,
 * or null when there is no data.
 *
 * Signals: result count, leader strength, title match density, market
 * depth, keyword specificity penalty, exact phrase bonus – with small
 * sample and backfill-aware dampening.
 */
export function estimatePopularity(
  competitors: CompetitorApp[],
  keyword: string,
): number | null {
  const n = competitors.length;
  if (n === 0) return null;

  const kwLower = keyword.toLowerCase().trim();
  const wordCount = kwLower ? kwLower.split(/\s+/).length : 1;

  // Signal 1: result count (0-25)
  let resultScore = Math.min(25, n * 2.5);

  // Signal 2: leader strength (0-30) – top half only, log interpolation
  const topHalf = competitors.slice(0, Math.max(Math.floor(n / 2), 1));
  const maxReviews = Math.max(...topHalf.map((c) => c.userRatingCount ?? 0));
  let leaderScore = 0;
  if (maxReviews >= 1_000_000) leaderScore = 30;
  else if (maxReviews > 0) leaderScore = bandScore(maxReviews, LEADER_BANDS, "log");

  // Signal 3: title match density (0-20)
  let titleMatches = 0;
  let exactPhraseMatches = 0;
  let relevanceSum = 0;
  for (const c of competitors) {
    const ev = keywordTitleEvidence(kwLower, c.trackName ?? "", c.primaryGenreName ?? "");
    relevanceSum += ev.evidence;
    if (ev.exactPhrase) {
      titleMatches++;
      exactPhraseMatches++;
    } else if (ev.allWords) {
      titleMatches++;
    }
  }
  let titleScore = Math.min(20, (titleMatches / n) * 40);

  // Signal 4: market depth – median reviews (0-10)
  const med = median(competitors.map((c) => c.userRatingCount ?? 0));
  let depthScore = 0;
  if (med >= 50_000) depthScore = 10;
  else if (med > 0) depthScore = bandScore(med, DEPTH_BANDS, "log");

  // Signal 5: keyword specificity penalty (-5 to -30)
  let specificityPenalty = 0;
  if (wordCount >= 6) specificityPenalty = -28;
  else if (wordCount > 1) specificityPenalty = SPECIFICITY_PENALTY[wordCount];

  // Signal 6: exact phrase match bonus (0-15)
  let exactBonus = Math.min(15, (exactPhraseMatches / n) * 50);

  // Small sample dampening: ratio signals ramp to full strength at n=10.
  const sampleDampening = Math.min(1, n / 10);
  titleScore *= sampleDampening;
  exactBonus *= sampleDampening;

  // Backfill-aware dampening: low title relevance means Apple padded the
  // results with unrelated apps.
  const relevance = Math.max(0.3, Math.min(1, (relevanceSum / n) * 2.6));
  resultScore *= relevance;
  leaderScore *= relevance;
  depthScore *= relevance;

  const total = Math.trunc(
    resultScore + leaderScore + titleScore + depthScore + specificityPenalty + exactBonus,
  );
  return Math.max(5, Math.min(100, total));
}

// ── Difficulty calculator ────────────────────────────────────────────────

export type OverrideReason = "small_result_set" | "weak_leader" | "backfill";

export type DifficultyInterpretation =
  | "No Data" | "Very Easy" | "Easy" | "Moderate" | "Hard" | "Very Hard" | "Extreme";

/** Ranking-tier difficulty breakdown (top 5 / top 10 / top 20). */
export interface RankingTier {
  minReviews: number;
  weakestApp: string;
  medianReviews: number;
  weakCount: number;
  freshCount: number;
  titleKeywordCount: number;
  totalApps: number;
  tierScore: number;
  label: string;
}

export interface RankingTiers {
  top5: RankingTier;
  top10: RankingTier;
  top20: RankingTier;
}

export interface DifficultyBreakdown {
  totalScore: number;
  rawTotal: number;
  overrideReason: OverrideReason | null;
  isBrandKeyword: boolean;
  brandName: string | null;
  ratingVolume: number;
  reviewVelocity: number;
  dominantPlayers: number;
  ratingQuality: number;
  marketAge: number;
  publisherDiversity: number;
  titleRelevance: number;
  interpretation: DifficultyInterpretation;
  titleMatchCount: number;
  medianReviews: number;
  avgReviews: number;
  rankingTiers: RankingTiers;
}

const RATING_VOLUME_BANDS: readonly Band[] = [
  [50, 5], [200, 15], [500, 30], [2_000, 50], [5_000, 65],
  [10_000, 78], [25_000, 88], [100_000, 95],
];

const VELOCITY_BANDS: readonly Band[] = [
  [10, 5], [50, 15], [200, 30], [1_000, 50], [5_000, 70],
  [20_000, 85], [50_000, 95],
];

const QUALITY_BANDS: readonly Band[] = [
  [3.0, 20], [3.5, 35], [4.0, 50], [4.3, 70], [4.5, 85], [5.0, 100],
];

const AGE_BANDS: readonly Band[] = [
  [0.5, 10], [1.0, 20], [2.0, 35], [3.0, 50], [5.0, 70], [8.0, 85], [10.0, 100],
];

const DAY_MS = 86_400_000;

// Python timedelta.days floors toward negative infinity.
const daysBetween = (now: Date, then: Date) =>
  Math.floor((now.getTime() - then.getTime()) / DAY_MS);

const parseDate = (value: string): Date | null => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Median reviews-per-year across competitors, log-scaled to 0-100. */
function reviewVelocityScore(competitors: CompetitorApp[], now: Date): number {
  const velocities: number[] = [];
  for (const c of competitors) {
    const reviews = c.userRatingCount ?? 0;
    const released = c.releaseDate ? parseDate(c.releaseDate) : null;
    if (released && reviews > 0) {
      const ageYears = Math.max(0.5, daysBetween(now, released) / 365.25);
      velocities.push(reviews / ageYears);
    }
  }
  if (velocities.length === 0) return 50; // default mid-range
  const medianVel = median(velocities);
  if (medianVel >= 50_000) return 100;
  return bandScore(medianVel, VELOCITY_BANDS, "log");
}

/** Average market age mapped to 0-100 (older = more entrenched). */
function marketAgeScore(competitors: CompetitorApp[], now: Date): number {
  const ages: number[] = [];
  for (const c of competitors) {
    const released = c.releaseDate ? parseDate(c.releaseDate) : null;
    if (released) ages.push(daysBetween(now, released) / 365.25);
  }
  if (ages.length === 0) return 50; // default mid-range
  const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
  if (avgAge <= 0) return 0;
  if (avgAge >= 10) return 100;
  return bandScore(avgAge, AGE_BANDS, "linear");
}

interface RawSubScores {
  ratingVolume: number;
  reviewVelocity: number;
  dominantPlayers: number;
  ratingQuality: number;
  marketAge: number;
  publisherDiversity: number;
  titleRelevance: number;
  titleMatchCount: number;
  medianReviews: number;
  avgReviews: number;
  ratingCounts: number[];
}

/**
 * The 7 weighted sub-scores and raw total, before backfill overrides.
 *
 * `fullResultCount` mirrors Python's `full_result_count`: when given, the
 * small-sample dampening ramps on this count instead of `competitors.length`.
 * Ranking tiers pass the FULL competitor count here so a top-5/10/20 slice
 * dampens on the keyword's overall result volume, not the deliberate slice
 * size. Omitted (as by every existing caller) it defaults to `n`, so
 * behaviour is unchanged for the overall difficulty score.
 */
function computeRawDifficulty(
  competitors: CompetitorApp[],
  kwLower: string,
  now: Date,
  fullResultCount?: number,
): { rawTotal: number; subs: RawSubScores } {
  const n = competitors.length;

  // Rating volume (30%) – log scale of MEDIAN review count
  const ratingCounts = competitors.map((c) => c.userRatingCount ?? 0);
  const medianRatings = median(ratingCounts);
  const avgRatings = ratingCounts.reduce((a, b) => a + b, 0) / n;
  let ratingVolume = 0;
  if (medianRatings >= 100_000) ratingVolume = 100;
  else if (medianRatings > 0) ratingVolume = bandScore(medianRatings, RATING_VOLUME_BANDS, "log");

  // Review velocity (10%)
  const reviewVelocity = reviewVelocityScore(competitors, now);

  // Dominant players (20%) – continuous log dominance, top half weighted 2×
  const logCeiling = Math.log10(10_000_000);
  const topHalfSize = Math.max(Math.floor(n / 2), 1);
  let dominanceTotal = 0;
  ratingCounts.forEach((r, i) => {
    if (r <= 0) return;
    const appDominance = Math.min(1, Math.log10(Math.max(r, 1)) / logCeiling);
    dominanceTotal += appDominance * (i < topHalfSize ? 2 : 1);
  });
  const weightSum = 2 * topHalfSize + (n - topHalfSize);
  let dominantPlayers = Math.min(100, (dominanceTotal / weightSum) * 100);

  // Rating quality (10%) – review-weighted (log1p) average star rating
  let weightedSum = 0;
  let weightTotal = 0;
  for (const c of competitors) {
    const rating = c.averageUserRating ?? 0;
    const reviews = c.userRatingCount ?? 0;
    if (rating > 0 && reviews > 0) {
      const w = Math.log1p(reviews);
      weightedSum += rating * w;
      weightTotal += w;
    }
  }
  const avgQuality = weightTotal > 0 ? weightedSum / weightTotal : 0;
  let ratingQuality = 0;
  if (avgQuality >= 5.0) ratingQuality = 100;
  else if (avgQuality > 0) ratingQuality = bandScore(avgQuality, QUALITY_BANDS, "linear");

  // Market age (10%)
  let marketAge = marketAgeScore(competitors, now);

  // Publisher diversity (10%)
  const uniquePublishers = new Set(
    competitors.filter((c) => c.sellerName).map((c) => c.sellerName!.toLowerCase()),
  ).size;
  let publisherDiversity = Math.min(100, (uniquePublishers / n) * 100);

  // Title relevance (10%) – strong matches only
  let titleMatchCount = 0;
  let relevanceSum = 0;
  for (const c of competitors) {
    const ev = keywordTitleEvidence(kwLower, c.trackName ?? "", c.primaryGenreName ?? "");
    relevanceSum += ev.evidence;
    if (ev.exactPhrase || ev.allWords) titleMatchCount++;
  }
  let titleRelevance = Math.min(100, (titleMatchCount / n) * 100);

  // Small sample dampening – ratio sub-scores ramp to full strength at n=10.
  const dampeningN = fullResultCount ?? n;
  const sampleDampening = Math.min(1, dampeningN / 10);
  publisherDiversity *= sampleDampening;
  titleRelevance *= sampleDampening;
  dominantPlayers *= sampleDampening;
  ratingQuality *= sampleDampening;

  // Backfill-aware dampening – low title relevance means Apple backfill.
  const relevance = Math.max(0.3, Math.min(1, (relevanceSum / n) * 2.6));
  publisherDiversity *= relevance;
  ratingQuality *= relevance;
  marketAge *= relevance;

  const rawTotal = Math.max(
    1,
    Math.min(
      100,
      Math.trunc(
        ratingVolume * 0.3 +
          reviewVelocity * 0.1 +
          dominantPlayers * 0.2 +
          ratingQuality * 0.1 +
          marketAge * 0.1 +
          publisherDiversity * 0.1 +
          titleRelevance * 0.1,
      ),
    ),
  );

  return {
    rawTotal,
    subs: {
      ratingVolume: round1(ratingVolume),
      reviewVelocity: round1(reviewVelocity),
      dominantPlayers: round1(dominantPlayers),
      ratingQuality: round1(ratingQuality),
      marketAge: round1(marketAge),
      publisherDiversity: round1(publisherDiversity),
      titleRelevance: round1(titleRelevance),
      titleMatchCount,
      medianReviews: Math.trunc(medianRatings),
      avgReviews: Math.trunc(avgRatings),
      ratingCounts,
    },
  };
}

const interpret = (total: number): DifficultyInterpretation => {
  if (total <= 15) return "Very Easy";
  if (total <= 35) return "Easy";
  if (total <= 55) return "Moderate";
  if (total <= 75) return "Hard";
  if (total <= 90) return "Very Hard";
  return "Extreme";
};

/** Wide-open default used for every tier when there are no competitors. */
const emptyRankingTier = (): RankingTier => ({
  minReviews: 0,
  weakestApp: "—",
  medianReviews: 0,
  weakCount: 0,
  freshCount: 0,
  titleKeywordCount: 0,
  totalApps: 0,
  tierScore: 0,
  label: "Easy",
});

/** Apps within a tier released in the last 12 months (unparseable/blank release dates don't count). */
function tierFreshCount(tierApps: CompetitorApp[], now: Date): number {
  let fresh = 0;
  for (const c of tierApps) {
    if (!c.releaseDate) continue;
    const released = parseDate(c.releaseDate);
    if (released && daysBetween(now, released) < 365) fresh++;
  }
  return fresh;
}

/**
 * Weak-leader cap and backfill discount for a single tier's raw score,
 * using the OVERALL (not per-tier) match ratio, leader reviews and brand
 * flag – the same keyword-level signals the overall score is corrected
 * with, so tiers never look harder than the overall difficulty implies.
 * Skipped entirely for an empty/blank keyword or when the keyword's full
 * result set has fewer than 2 competitors (ratio signals are meaningless).
 */
function applyTierOverrides(
  rawTierScore: number,
  kwLower: string,
  fullResultCount: number,
  overallMatchRatio: number,
  overallLeaderReviews: number,
  isBrandKeyword: boolean,
): number {
  let tierScore = rawTierScore;

  if (kwLower && fullResultCount >= 2) {
    let tierCap: number | null = null;
    if (overallLeaderReviews < 1_000 && !isBrandKeyword) {
      tierCap = Math.trunc(
        15 + (35 * Math.log10(overallLeaderReviews + 1)) / Math.log10(1001),
      );
    }
    if (tierCap !== null && tierScore > tierCap) {
      tierScore =
        overallMatchRatio > 0.2
          ? Math.trunc(tierCap + (tierScore - tierCap) * overallMatchRatio)
          : tierCap;
    }

    if (overallMatchRatio < 0.2 && overallLeaderReviews < 1_000 && !isBrandKeyword) {
      const ratioFactor = Math.min(1, 0.6 + 2 * overallMatchRatio);
      const leaderFactor = Math.log10(overallLeaderReviews + 1) / Math.log10(1001);
      const discount = Math.max(
        0.6,
        Math.min(1, ratioFactor + (1 - ratioFactor) * leaderFactor),
      );
      tierScore = Math.max(1, Math.trunc(tierScore * discount));
    }
  }

  return Math.max(1, Math.min(100, tierScore));
}

const TIER_SIZES: readonly [key: keyof RankingTiers, size: number][] = [
  ["top5", 5],
  ["top10", 10],
  ["top20", 20],
];

/**
 * Ranking tier analysis for Top 5 / Top 10 / Top 20: runs the same
 * difficulty algorithm on each tier's competitor subset (dampened on the
 * FULL competitor count, not the slice size), corrects each tier with the
 * OVERALL match ratio/leader reviews/brand signal, then floors every tier
 * to at least the overall difficulty and enforces that a larger tier can
 * never be harder than a smaller one (Top 5 ⊂ Top 10 ⊂ Top 20).
 *
 * Only called with a non-empty `competitors` list, so every tier slice has
 * at least one app – the Python n==0 per-tier branch is instead reproduced
 * directly by callers via `emptyRankingTier()` for the whole-list-empty case.
 */
function computeRankingTiers(
  competitors: CompetitorApp[],
  kwLower: string,
  now: Date,
  overallScore: number,
  overallMatchRatio: number,
  overallLeaderReviews: number,
  isBrandKeyword: boolean,
): RankingTiers {
  const fullResultCount = competitors.length;
  const scores = {} as Record<keyof RankingTiers, number>;
  const rest = {} as Record<keyof RankingTiers, Omit<RankingTier, "tierScore" | "label">>;

  for (const [key, size] of TIER_SIZES) {
    const tierApps = competitors.slice(0, size);
    const { rawTotal, subs } = computeRawDifficulty(tierApps, kwLower, now, fullResultCount);

    scores[key] = applyTierOverrides(
      rawTotal,
      kwLower,
      fullResultCount,
      overallMatchRatio,
      overallLeaderReviews,
      isBrandKeyword,
    );

    const { ratingCounts } = subs;
    const minReviews = Math.min(...ratingCounts);
    const minIndex = ratingCounts.indexOf(minReviews);

    rest[key] = {
      minReviews,
      weakestApp: tierApps[minIndex]?.trackName ?? "Unknown",
      medianReviews: subs.medianReviews,
      weakCount: ratingCounts.filter((r) => r < 1_000).length,
      freshCount: tierFreshCount(tierApps, now),
      titleKeywordCount: subs.titleMatchCount,
      totalApps: tierApps.length,
    };
  }

  // Floor: every tier must be ≥ overall difficulty (Top-N ⊂ All, so it's
  // always at least as hard to break into a tier as to compete at all).
  // `overallScore` is always ≥ 1 here (calculateDifficulty clamps it), so
  // the floor always applies – no need to special-case a zero score.
  for (const [key] of TIER_SIZES) {
    if (scores[key] < overallScore) scores[key] = overallScore;
  }

  // Monotonicity: a larger tier can never be harder than a smaller one.
  if (scores.top10 > scores.top5) scores.top10 = scores.top5;
  if (scores.top20 > scores.top10) scores.top20 = scores.top10;

  // Labelling from the final (floored, monotonic) score alone is exactly
  // equivalent to Python's re-label-then-cap-label dance: `_score_to_label`
  // is monotonic non-decreasing, so capping a tier's score down to a
  // smaller tier's score always yields the same label capping its
  // (already re-labelled) label would have produced.
  const build = (key: keyof RankingTiers): RankingTier => ({
    ...rest[key],
    tierScore: scores[key],
    label: interpret(scores[key]),
  });

  return { top5: build("top5"), top10: build("top10"), top20: build("top20") };
}

/**
 * Calculate keyword difficulty (1-100) from competitor data, with
 * post-processing overrides correcting for Apple's generic backfill
 * (small result set cap, weak leader cap, backfill discount) and brand
 * keyword detection.
 */
export function calculateDifficulty(
  competitors: CompetitorApp[],
  keyword = "",
  now: Date = new Date(),
): { total: number; breakdown: DifficultyBreakdown } {
  const n = competitors.length;
  if (n === 0) {
    return {
      total: 0,
      breakdown: {
        totalScore: 0,
        rawTotal: 0,
        overrideReason: null,
        isBrandKeyword: false,
        brandName: null,
        ratingVolume: 0,
        reviewVelocity: 0,
        dominantPlayers: 0,
        ratingQuality: 0,
        marketAge: 0,
        publisherDiversity: 0,
        titleRelevance: 0,
        interpretation: "No Data",
        titleMatchCount: 0,
        medianReviews: 0,
        avgReviews: 0,
        rankingTiers: {
          top5: emptyRankingTier(),
          top10: emptyRankingTier(),
          top20: emptyRankingTier(),
        },
      },
    };
  }

  const kwLower = keyword.toLowerCase().trim();
  const { rawTotal, subs } = computeRawDifficulty(competitors, kwLower, now);
  let total = rawTotal;

  let overrideReason: OverrideReason | null = null;
  const leaderReviews = competitors[0].userRatingCount ?? 0;
  const matchRatio = subs.titleMatchCount / n;

  // Brand keyword detection: skip weak-leader adjustments when the keyword
  // matches the #1 app's publisher – those results are not backfill.
  const { isBrand, brandName } = kwLower
    ? isBrandKeyword(kwLower, competitors[0], competitors)
    : { isBrand: false, brandName: null };

  // Signal 0: small result set cap (n=1→10, 2→20, 3→31, 4→40)
  const SMALL_CAPS: Record<number, number> = { 1: 10, 2: 20, 3: 31, 4: 40 };
  const smallCap = SMALL_CAPS[n];
  if (smallCap !== undefined && total > smallCap) {
    total = smallCap;
    overrideReason = "small_result_set";
  }

  if (kwLower && n >= 2) {
    // Signal 1: weak leader cap – smooth log interpolation, blended away
    // when many competitors genuinely target the keyword.
    if (leaderReviews < 1_000 && !isBrand) {
      const leaderCap = Math.trunc(
        15 + (35 * Math.log10(leaderReviews + 1)) / Math.log10(1001),
      );
      if (total > leaderCap) {
        total =
          matchRatio > 0.2
            ? Math.trunc(leaderCap + (total - leaderCap) * matchRatio)
            : leaderCap;
        overrideReason = "weak_leader";
      }
    }

    // Signal 2: backfill discount – few title matches AND a weak leader
    // mean most results are generic backfill from broader terms.
    if (matchRatio < 0.2 && leaderReviews < 1_000 && !isBrand) {
      const ratioFactor = Math.min(1, 0.6 + 2 * matchRatio);
      const leaderFactor = Math.log10(leaderReviews + 1) / Math.log10(1001);
      const discount = Math.max(
        0.6,
        Math.min(1, ratioFactor + (1 - ratioFactor) * leaderFactor),
      );
      const discounted = Math.max(1, Math.trunc(total * discount));
      if (discounted < total) {
        total = discounted;
        overrideReason = "backfill";
      }
    }
  }

  total = Math.max(1, Math.min(100, total));

  // Ranking tier analysis reuses the FINAL (post-override) total and the
  // same overall match ratio / leader reviews / brand signal used above,
  // exactly like the Python call site in calculate().
  const rankingTiers = computeRankingTiers(
    competitors,
    kwLower,
    now,
    total,
    matchRatio,
    leaderReviews,
    isBrand,
  );

  return {
    total,
    breakdown: {
      totalScore: total,
      rawTotal,
      overrideReason,
      isBrandKeyword: isBrand,
      brandName,
      ratingVolume: subs.ratingVolume,
      reviewVelocity: subs.reviewVelocity,
      dominantPlayers: subs.dominantPlayers,
      ratingQuality: subs.ratingQuality,
      marketAge: subs.marketAge,
      publisherDiversity: subs.publisherDiversity,
      titleRelevance: subs.titleRelevance,
      interpretation: interpret(total),
      titleMatchCount: subs.titleMatchCount,
      medianReviews: subs.medianReviews,
      avgReviews: subs.avgReviews,
      rankingTiers,
    },
  };
}
