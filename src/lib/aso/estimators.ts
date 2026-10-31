// Ported from respectaso aso/services.py at 798335f (2026-10-24) –
// PopularityEstimator (estimate v2), DifficultyCalculator and their shared
// title-evidence helpers; the per-app factor curves come from aso/strength.py
// (./strength.ts), shared with the opportunity score. Previously ported from
// 0b0a0de (2026-07-23).
//
// DifficultyCalculator and their shared title-evidence helpers. Every
// numeric path mirrors the Python reference; parity is enforced by
// tests/unit/aso/parity.test.ts and tests/unit/aso/ranking-tiers.test.ts
// against vectors generated from the original code
// (scripts/gen-aso-parity-vectors.py).
// ponytail: insights, opportunity signals and download estimates are not
// ported – the keyword badge only needs the scores. Ranking tiers (top
// 5/10/20 difficulty) ARE ported, but their `highlights` field (English
// prose bullets) is intentionally not – the badge only needs the numbers.

import {
  ageScore,
  momentumScore,
  ratingScore,
  ratingsPerYear,
  STRENGTH_WEIGHTS as W,
  volumeScore,
  yearsSince,
} from "./strength";

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
  formattedPrice?: string;
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

/** The lowercase words of `text` (respectaso aso/words.py tokenize_words):
 *  runs of letters, combining marks and digits in any script. Marks matter:
 *  without them Thai and Hindi words are cut apart. */
export function tokenizeWords(text: string): string[] {
  return (text ?? "").normalize("NFC").toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

/** Tokenize for title matching: words, with a few plural forms folded. */
function tokenize(text: string): string[] {
  return tokenizeWords(text).map((tok) => TOKEN_NORMALIZATION[tok] ?? tok);
}

/** Run-together spelling of a multi-word keyword: "scroll less" →
 *  "scrollless". Apple matches "ScrollLess" and "Scroll Less" alike, so a
 *  title running the words together counts as the exact phrase. */
export function compoundForm(tokens: string[]): string {
  return tokens.length > 1 ? tokens.join("") : "";
}

/** A title token starting with the keyword's run-together form ("smartapp"
 *  never matches "art app"; "scrolllessapp" matches "scroll less"). */
function hasCompoundForm(kwTokens: string[], titleTokens: string[]): boolean {
  const compound = compoundForm(kwTokens);
  return compound !== "" && titleTokens.some((tok) => tok.startsWith(compound));
}

export interface TitleEvidence {
  exactPhrase: boolean;
  allWords: boolean;
  partialOverlap: number;
  proximity: number;
  evidence: number;
}

/** Match hierarchy: exact phrase (or its run-together form) > all words
 *  (any order) > partial overlap. */
export function keywordTitleEvidence(
  keyword: string,
  title: string,
  genre: string,
): TitleEvidence {
  const kw = keyword.toLowerCase().trim();
  const titleLower = title.toLowerCase();
  const kwTokenList = tokenize(kw);
  const kwTokens = new Set(kwTokenList);
  const titleTokensList = tokenize(titleLower);
  const titleTokens = new Set(titleTokensList);

  if (kwTokens.size === 0 || titleTokens.size === 0) {
    return { exactPhrase: false, allWords: false, partialOverlap: 0, proximity: 0, evidence: 0 };
  }

  let exactPhrase =
    (kw !== "" && titleLower.includes(kw)) || hasCompoundForm(kwTokenList, titleTokensList);
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

/** Leader strength, 0-30, from the strongest leading app's rating count. */
function leaderBandScore(maxReviews: number): number {
  if (maxReviews <= 0) return 0;
  if (maxReviews >= 1_000_000) return 30;
  return bandScore(maxReviews, LEADER_BANDS, "log");
}

/** Python's round(): half to even. */
export function pyRound(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/**
 * Calibrated weights (estimate v2), fitted upstream on 2026-08-17 against
 * 327 official Apple searchPopularity1to100 values (US) plus 90
 * below-top-terms negatives. Never hand-tune: refit upstream. Insertion
 * order matters – it is the summation order of the Python reference.
 */
export const POPULARITY_V2_WEIGHTS = {
  intercept: 3.6672,
  fResult: 1.0404,
  fLeader: -1.9714,
  fTitle: 0.6129,
  fDepth: 2.9001,
  fSpec: 0.8644,
  fExact: -0.338,
  xTop1Exact: 2.1709,
  xLeaderMag: 8.1524,
} as const;

export interface PopularitySignals {
  fResult: number;
  fLeader: number;
  fTitle: number;
  fDepth: number;
  fSpec: number;
  fExact: number;
  xTop1Exact: number;
  xLeaderMag: number;
}

/**
 * The observable signal components behind estimatePopularity (respectaso
 * PopularityEstimator.signal_components), or null without competitors.
 * Only the components V2 weights name are computed; the upstream study-only
 * "smooth" candidates are not ported.
 */
export function popularitySignals(
  competitors: CompetitorApp[],
  keyword: string,
): PopularitySignals | null {
  const n = competitors.length;
  if (n === 0) return null;

  const kwLower = keyword.toLowerCase().trim();
  const wordCount = kwLower ? kwLower.split(/\s+/).length : 1;

  // Signal 1: result count (0-25)
  let resultScore = Math.min(25, n * 2.5);

  // Signal 2: leader strength (0-30) – top half only, log interpolation
  const topHalf = competitors.slice(0, Math.max(Math.floor(n / 2), 1));
  const maxReviews = Math.max(...topHalf.map((c) => c.userRatingCount ?? 0));
  let leaderScore = leaderBandScore(maxReviews);

  // Signal 3: title match density (0-20), plus the strongest exact-title
  // match in the top 5 for the brand signal.
  let titleMatches = 0;
  let exactPhraseMatches = 0;
  let relevanceSum = 0;
  let bestExactReviews = 0;
  competitors.forEach((c, index) => {
    const ev = keywordTitleEvidence(kwLower, c.trackName ?? "", c.primaryGenreName ?? "");
    relevanceSum += ev.evidence;
    if (ev.exactPhrase) {
      titleMatches++;
      exactPhraseMatches++;
      if (index < 5) bestExactReviews = Math.max(bestExactReviews, c.userRatingCount ?? 0);
    } else if (ev.allWords) {
      titleMatches++;
    }
  });
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

  return {
    fResult: resultScore,
    fLeader: leaderScore,
    fTitle: titleScore,
    fDepth: depthScore,
    fSpec: specificityPenalty,
    fExact: exactBonus,
    xTop1Exact: Math.log10(1 + bestExactReviews),
    xLeaderMag: Math.log10(1 + maxReviews),
  };
}

/**
 * Estimate keyword search popularity (1-100) from iTunes competitor data,
 * calibrated to Apple's searchPopularity scale (estimate v2): reported head
 * keywords land around 40+, below-top-terms keywords lower. Null without data.
 */
export function estimatePopularity(
  competitors: CompetitorApp[],
  keyword: string,
): number | null {
  const signals = popularitySignals(competitors, keyword);
  if (!signals) return null;
  // Python: intercept + sum(...) – the sum is accumulated first.
  let sum = 0;
  for (const [name, weight] of Object.entries(POPULARITY_V2_WEIGHTS)) {
    if (name === "intercept") continue;
    sum += weight * signals[name as keyof PopularitySignals];
  }
  const raw = POPULARITY_V2_WEIGHTS.intercept + sum;
  return pyRound(Math.max(1, Math.min(100, raw)));
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

const DAY_MS = 86_400_000;

// Python timedelta.days floors toward negative infinity.
const daysBetween = (now: Date, then: Date) =>
  Math.floor((now.getTime() - then.getTime()) / DAY_MS);

const parseDate = (value: string): Date | null => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** The field's momentum: median ratings per year across competitors, on the
 *  shared momentum curve (strength.momentumScore). */
function reviewVelocityScore(competitors: CompetitorApp[], now: Date): number {
  const velocities: number[] = [];
  for (const c of competitors) {
    const reviews = c.userRatingCount ?? 0;
    const years = yearsSince(c.releaseDate, now);
    if (years != null && reviews > 0) velocities.push(ratingsPerYear(reviews, years));
  }
  if (velocities.length === 0) return 50; // default mid-range
  return momentumScore(median(velocities));
}

/** The field's age: mean years on the store, on the shared age curve. */
function marketAgeScore(competitors: CompetitorApp[], now: Date): number {
  const ages: number[] = [];
  for (const c of competitors) {
    const years = yearsSince(c.releaseDate, now);
    if (years != null) ages.push(years);
  }
  if (ages.length === 0) return 50; // default mid-range
  return ageScore(ages.reduce((a, b) => a + b, 0) / ages.length);
}

/** The weak-leader ceiling: 15 at 0 reviews, 50 at about 1,000. */
export function leaderCap(leaderReviews: number): number {
  return 15 + (35 * Math.log10(leaderReviews + 1)) / Math.log10(1001);
}

export const LEADER_CAP_FULL = 1_000;
export const LEADER_CAP_GONE = 3_000;

/** How much of the weak-leader cap applies: 1 up to 1,000 reviews, fading
 *  on a log scale to 0 at 3,000 (it used to switch off at exactly 1,000). */
export function leaderCapWeight(leaderReviews: number): number {
  if (leaderReviews <= LEADER_CAP_FULL) return 1;
  if (leaderReviews >= LEADER_CAP_GONE) return 0;
  return (
    1 -
    Math.log10(leaderReviews / LEADER_CAP_FULL) / Math.log10(LEADER_CAP_GONE / LEADER_CAP_FULL)
  );
}

/** Ceiling a tiny result set puts on difficulty: 10 points per app, up to
 *  nine apps; from ten on, none. */
export function smallResultCap(resultCount: number): number | null {
  return resultCount >= 1 && resultCount <= 9 ? 10 * resultCount : null;
}

/**
 * Weak-leader cap and backfill discount, shared by the overall score and
 * every ranking tier. The cap bites in proportion to the backfill
 * (`cap + (total - cap) * matchRatio`), in full below 1,000 leader reviews
 * and fading out by 3,000. Brand keywords get neither.
 */
function leaderCorrections(
  total: number,
  leaderReviews: number,
  matchRatio: number,
  isBrand: boolean,
): { total: number; reason: OverrideReason | null } {
  let reason: OverrideReason | null = null;
  if (isBrand) return { total, reason };
  const weight = leaderCapWeight(leaderReviews);
  if (weight > 0) {
    const cap = leaderCap(leaderReviews);
    if (total > cap) {
      const capped = cap + (total - cap) * matchRatio;
      const adjusted = Math.trunc(total - weight * (total - capped));
      if (adjusted < total) {
        total = adjusted;
        reason = "weak_leader";
      }
    }
  }
  if (matchRatio < 0.2 && leaderReviews < LEADER_CAP_FULL) {
    const ratioFactor = Math.min(1, 0.6 + 2 * matchRatio);
    const leaderFactor = Math.log10(leaderReviews + 1) / Math.log10(1001);
    const discount = Math.max(0.6, Math.min(1, ratioFactor + (1 - ratioFactor) * leaderFactor));
    const discounted = Math.max(1, Math.trunc(total * discount));
    if (discounted < total) {
      total = discounted;
      reason = "backfill";
    }
  }
  return { total, reason };
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
  const ratingVolume = volumeScore(medianRatings);

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
  const weightSum = 2 * topHalfSize + Math.max(n - topHalfSize, 0);
  let dominantPlayers = Math.min(100, (dominanceTotal / Math.max(weightSum, 1)) * 100);

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
  let ratingQuality = ratingScore(avgQuality);

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
        ratingVolume * W.volume +
          reviewVelocity * W.momentum +
          dominantPlayers * W.dominance +
          ratingQuality * W.rating +
          marketAge * W.age +
          publisherDiversity * W.publishers +
          titleRelevance * W.title,
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
  // Empty: the display layer renders its own "–" placeholder.
  weakestApp: "",
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

/** Leader corrections for one tier's raw score, from the OVERALL match
 *  ratio, leader reviews and brand flag; skipped for a blank keyword or a
 *  result set under two apps. */
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
    tierScore = leaderCorrections(
      tierScore, overallLeaderReviews, overallMatchRatio, isBrandKeyword,
    ).total;
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

  // Signal 0: small result set cap – ten points per app, up to nine apps.
  const smallCap = smallResultCap(n);
  if (smallCap !== null && total > smallCap) {
    total = smallCap;
    overrideReason = "small_result_set";
  }

  // Signals 1 and 2: weak-leader cap and backfill discount.
  if (kwLower && n >= 2) {
    const corrected = leaderCorrections(total, leaderReviews, matchRatio, isBrand);
    total = corrected.total;
    if (corrected.reason) overrideReason = corrected.reason;
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
