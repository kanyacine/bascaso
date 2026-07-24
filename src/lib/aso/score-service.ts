// Keyword scoring service: cache-first against the keyword_scores table
// (one row per keyword × country), stale-while-revalidate beyond 24 h,
// in-flight dedup, and adaptive pacing of iTunes calls (~20/min).

import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { keywordScoreHistory, keywordScores } from "@/db/schema";
import {
  calculateDifficulty,
  estimatePopularity,
  type CompetitorApp,
  type DifficultyBreakdown,
} from "./estimators";
import {
  calcOpportunity,
  classifyKeyword,
  type ClassificationLabel,
} from "./scoring";
import { normalizeKeyword } from "./score-display";
import { AdaptiveRateLimiter, ItunesRateLimited, searchApps } from "./itunes";

export const SCORE_TTL_MS = 24 * 60 * 60 * 1000; // 1 score/day/keyword/country

/** Wipe the whole keyword scoring cache and its trend history. Backs the
 *  "delete all search history" settings action; the next score request for
 *  any keyword recomputes from scratch. */
export function clearScoreCache(): void {
  db.delete(keywordScores).run();
  db.delete(keywordScoreHistory).run();
}

/** Trimmed competitor stored per score row and shown in the detail panel. */
export interface CompetitorSnapshot {
  trackId: number | null;
  trackName: string;
  sellerName: string;
  artworkUrl100: string;
  averageUserRating: number;
  userRatingCount: number;
  primaryGenreName: string;
  formattedPrice: string;
  releaseDate: string;
  currentVersionReleaseDate: string;
  trackViewUrl: string;
}

/** Previous observation for trend deltas; null when no older history exists. */
export interface PreviousScore {
  popularity: number | null;
  difficulty: number;
  opportunity: number;
  rank: number | null;
  fetchedAt: number;
}

export interface KeywordScore {
  keyword: string;
  country: string;
  popularity: number | null;
  difficulty: number;
  opportunity: number;
  classification: ClassificationLabel;
  fetchedAt: number;
  stale: boolean;
  /** 1-based position of the requested app in the search results; null
   *  when no app id was given, the app is unranked, or the row predates
   *  result id storage. */
  rank: number | null;
  /** Full difficulty breakdown (sub-scores, tiers…); null on legacy rows. */
  details: DifficultyBreakdown | null;
  /** Number of App Store results the score was computed from; null on legacy rows. */
  resultCount: number | null;
  /** Top search results snapshot; null on legacy rows. */
  competitors: CompetitorSnapshot[] | null;
  /** Previous history observation, for deltas; null on first observation. */
  previous: PreviousScore | null;
}

function toSnapshot(app: CompetitorApp): CompetitorSnapshot {
  return {
    trackId: app.trackId ?? null,
    trackName: app.trackName ?? "",
    sellerName: app.sellerName ?? "",
    artworkUrl100: app.artworkUrl100 ?? "",
    averageUserRating: app.averageUserRating ?? 0,
    userRatingCount: app.userRatingCount ?? 0,
    primaryGenreName: app.primaryGenreName ?? "",
    formattedPrice: app.formattedPrice ?? "",
    releaseDate: app.releaseDate ?? "",
    currentVersionReleaseDate: app.currentVersionReleaseDate ?? "",
    trackViewUrl: app.trackViewUrl ?? "",
  };
}

/** Latest history observation strictly older than `before`, with the rank
 *  the given app held at that time. */
function previousScore(
  keyword: string,
  country: string,
  before: number,
  appAppleId?: number,
): PreviousScore | null {
  const row = db
    .select()
    .from(keywordScoreHistory)
    .where(
      and(
        eq(keywordScoreHistory.keyword, keyword),
        eq(keywordScoreHistory.country, country),
        lt(keywordScoreHistory.fetchedAt, before),
      ),
    )
    .orderBy(desc(keywordScoreHistory.fetchedAt))
    .limit(1)
    .get();
  if (!row) return null;
  return {
    popularity: row.popularity,
    difficulty: row.difficulty,
    opportunity: row.opportunity,
    rank: rankIn(row.resultIds ? (JSON.parse(row.resultIds) as number[]) : null, appAppleId),
    fetchedAt: row.fetchedAt,
  };
}

function rankIn(resultIds: number[] | null, appAppleId?: number): number | null {
  if (!appAppleId || !resultIds) return null;
  const idx = resultIds.indexOf(appAppleId);
  return idx === -1 ? null : idx + 1;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const limiter = new AdaptiveRateLimiter();
let chain: Promise<unknown> = Promise.resolve();
const inFlight = new Map<
  string,
  Promise<{ base: Omit<KeywordScore, "rank" | "previous">; ids: number[] }>
>();

// Serialize iTunes calls with the adaptive delay between them.
function pacedSearch(keyword: string, country: string) {
  const call = chain.then(async () => {
    try {
      const apps = await searchApps(keyword, country);
      limiter.recordSuccess();
      return apps;
    } catch (err) {
      limiter.recordFailure(
        err instanceof ItunesRateLimited ? err.retryAfter : undefined,
      );
      throw err;
    }
  });
  chain = call.then(
    () => sleep(limiter.currentDelayMs),
    () => sleep(limiter.currentDelayMs),
  );
  return call;
}

async function computeAndStore(
  keyword: string,
  country: string,
): Promise<{ base: Omit<KeywordScore, "rank" | "previous">; ids: number[] }> {
  const apps = await pacedSearch(keyword, country);
  const popularity = estimatePopularity(apps, keyword);
  const { total: difficulty, breakdown } = calculateDifficulty(apps, keyword);
  const opportunity = calcOpportunity(popularity ?? 0, difficulty);
  const classification = classifyKeyword(popularity ?? 0, difficulty);
  const fetchedAt = Date.now();
  const ids = apps.map((a) => a.trackId).filter((id): id is number => id != null);
  const resultIds = JSON.stringify(ids);
  const details = JSON.stringify(breakdown);
  // Every result the score was computed from, not just the first page –
  // the detail panel lists them all. Bounded by the search limit (25).
  const snapshot = apps.map(toSnapshot);
  const competitors = JSON.stringify(snapshot);

  // Preserve the observation being overwritten – rows written before the
  // history table existed would otherwise never yield a delta.
  const existing = db
    .select()
    .from(keywordScores)
    .where(and(eq(keywordScores.keyword, keyword), eq(keywordScores.country, country)))
    .get();
  if (existing) {
    db.insert(keywordScoreHistory)
      .values({
        keyword,
        country,
        popularity: existing.popularity,
        difficulty: existing.difficulty,
        opportunity: existing.opportunity,
        resultIds: existing.resultIds,
        fetchedAt: existing.fetchedAt,
      })
      .onConflictDoNothing()
      .run();
  }

  db.insert(keywordScores)
    .values({ keyword, country, popularity, difficulty, opportunity, classification, fetchedAt, resultIds, details, competitors })
    .onConflictDoUpdate({
      target: [keywordScores.keyword, keywordScores.country],
      set: { popularity, difficulty, opportunity, classification, fetchedAt, resultIds, details, competitors },
    })
    .run();

  db.insert(keywordScoreHistory)
    .values({ keyword, country, popularity, difficulty, opportunity, resultIds, fetchedAt })
    .onConflictDoNothing()
    .run();

  return {
    base: {
      keyword, country, popularity, difficulty, opportunity, classification, fetchedAt,
      stale: false,
      details: breakdown,
      resultCount: ids.length,
      competitors: snapshot,
    },
    ids,
  };
}

// Rank is derived per caller from the shared compute, so deduped
// concurrent requests for different apps each get their own rank.
function dedupedCompute(
  keyword: string,
  country: string,
  appAppleId?: number,
): Promise<KeywordScore> {
  const key = `${country}:${keyword}`;
  const existing = inFlight.get(key);
  const shared =
    existing ??
    computeAndStore(keyword, country).finally(() => {
      inFlight.delete(key);
    });
  if (!existing) inFlight.set(key, shared);
  return shared.then(({ base, ids }) => ({
    ...base,
    rank: rankIn(ids, appAppleId),
    previous: previousScore(keyword, country, base.fetchedAt, appAppleId),
  }));
}

/**
 * Score a keyword for a country. Serves the stored score when fresh
 * (< 24 h); serves it stale while refreshing in the background beyond
 * that; computes synchronously on a cache miss.
 */
export async function scoreKeyword(
  rawKeyword: string,
  rawCountry: string,
  appAppleId?: number,
): Promise<KeywordScore> {
  const keyword = normalizeKeyword(rawKeyword);
  const country = rawCountry.trim().toLowerCase();

  const row = db
    .select()
    .from(keywordScores)
    .where(and(eq(keywordScores.keyword, keyword), eq(keywordScores.country, country)))
    .get();

  if (row) {
    const stale = Date.now() - row.fetchedAt > SCORE_TTL_MS;
    if (stale) {
      // Fire-and-forget background refresh; the next read serves the new row.
      void dedupedCompute(keyword, country).catch(() => {});
    }
    const ids = row.resultIds ? (JSON.parse(row.resultIds) as number[]) : null;
    return {
      keyword,
      country,
      popularity: row.popularity,
      difficulty: row.difficulty,
      opportunity: row.opportunity,
      classification: row.classification as ClassificationLabel,
      fetchedAt: row.fetchedAt,
      stale,
      rank: rankIn(ids, appAppleId),
      details: row.details ? (JSON.parse(row.details) as DifficultyBreakdown) : null,
      resultCount: ids ? ids.length : null,
      competitors: row.competitors
        ? (JSON.parse(row.competitors) as CompetitorSnapshot[])
        : null,
      previous: previousScore(keyword, country, row.fetchedAt, appAppleId),
    };
  }

  return dedupedCompute(keyword, country, appAppleId);
}
