// Keyword scoring service: cache-first against the keyword_scores table
// (one row per keyword × country), stale-while-revalidate beyond 24 h,
// in-flight dedup, and adaptive pacing of iTunes calls (~20/min).

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { keywordScores } from "@/db/schema";
import { calculateDifficulty, estimatePopularity } from "./estimators";
import {
  calcOpportunity,
  classifyKeyword,
  type ClassificationLabel,
} from "./scoring";
import { AdaptiveRateLimiter, ItunesRateLimited, searchApps } from "./itunes";

export const SCORE_TTL_MS = 24 * 60 * 60 * 1000; // 1 score/day/keyword/country

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
  Promise<{ base: Omit<KeywordScore, "rank">; ids: number[] }>
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
): Promise<{ base: Omit<KeywordScore, "rank">; ids: number[] }> {
  const apps = await pacedSearch(keyword, country);
  const popularity = estimatePopularity(apps, keyword);
  const { total: difficulty } = calculateDifficulty(apps, keyword);
  const opportunity = calcOpportunity(popularity ?? 0, difficulty);
  const classification = classifyKeyword(popularity ?? 0, difficulty);
  const fetchedAt = Date.now();
  const ids = apps.map((a) => a.trackId).filter((id): id is number => id != null);
  const resultIds = JSON.stringify(ids);

  db.insert(keywordScores)
    .values({ keyword, country, popularity, difficulty, opportunity, classification, fetchedAt, resultIds })
    .onConflictDoUpdate({
      target: [keywordScores.keyword, keywordScores.country],
      set: { popularity, difficulty, opportunity, classification, fetchedAt, resultIds },
    })
    .run();

  return {
    base: { keyword, country, popularity, difficulty, opportunity, classification, fetchedAt, stale: false },
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
  return shared.then(({ base, ids }) => ({ ...base, rank: rankIn(ids, appAppleId) }));
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
  const keyword = rawKeyword.trim().toLowerCase();
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
    return {
      keyword,
      country,
      popularity: row.popularity,
      difficulty: row.difficulty,
      opportunity: row.opportunity,
      classification: row.classification as ClassificationLabel,
      fetchedAt: row.fetchedAt,
      stale,
      rank: rankIn(row.resultIds ? (JSON.parse(row.resultIds) as number[]) : null, appAppleId),
    };
  }

  return dedupedCompute(keyword, country, appAppleId);
}
