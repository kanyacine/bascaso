// iTunes Search client, ported from respectaso aso/services.py
// (ITunesSearchService) and aso/throttle.py (AdaptiveITunesRateLimiter).
// Primary: iTunes Search API. Fallback: App Store SSR page + Lookup API
// batch hydration – both produce the same CompetitorApp shape.
// ponytail: lookup_by_id, lookup_full_description and find_app_rank are
// not ported – scoring only needs keyword search.

import type { CompetitorApp } from "./estimators";

const SEARCH_URL = "https://itunes.apple.com/search";
const LOOKUP_URL = "https://itunes.apple.com/lookup";

const SSR_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
    "Version/17.0 Safari/605.1.15",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

export class ItunesRateLimited extends Error {
  readonly retryAfter: number | undefined;

  constructor(message = "iTunes API rate-limited", retryAfter?: number) {
    super(message);
    this.name = "ItunesRateLimited";
    this.retryAfter = retryAfter;
  }
}

/** Both the iTunes Search API and the SSR fallback are down. */
export class SearchApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchApiUnavailableError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Parse the HTTP Retry-After header (delta-seconds form only). */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value.trim());
  return Number.isNaN(parsed) ? undefined : parsed;
}

interface RawResult {
  trackId?: number;
  trackName?: string;
  artworkUrl100?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  releaseDate?: string;
  currentVersionReleaseDate?: string;
  primaryGenreName?: string;
  formattedPrice?: string;
  description?: string;
  sellerName?: string;
  bundleId?: string;
  trackViewUrl?: string;
}

function parseApp(result: RawResult): CompetitorApp {
  const desc = result.description ?? "";
  return {
    trackId: result.trackId,
    trackName: result.trackName ?? "",
    artworkUrl100: result.artworkUrl100 ?? "",
    averageUserRating: result.averageUserRating ?? 0,
    userRatingCount: result.userRatingCount ?? 0,
    releaseDate: result.releaseDate ?? "",
    currentVersionReleaseDate: result.currentVersionReleaseDate ?? "",
    primaryGenreName: result.primaryGenreName ?? "",
    formattedPrice: result.formattedPrice ?? "Free",
    description: desc.length > 200 ? desc.slice(0, 200) + "..." : desc,
    sellerName: result.sellerName ?? "",
    bundleId: result.bundleId ?? "",
    trackViewUrl: result.trackViewUrl ?? "",
  };
}

// ── Primary: iTunes Search API ───────────────────────────────────────────

async function itunesSearch(
  keyword: string,
  country: string,
  limit: number,
): Promise<CompetitorApp[]> {
  const params = new URLSearchParams({
    term: keyword,
    country,
    entity: "software",
    limit: String(limit),
  });

  // Two attempts: the second fires only on rate-limit/5xx responses.
  // Network errors propagate immediately so the SSR fallback takes over.
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${SEARCH_URL}?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 429 || response.status === 503) {
      const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
      if (attempt === 0) {
        await sleep(retryAfter !== undefined ? Math.min(5, retryAfter) * 1000 : 2000);
        continue;
      }
      throw new ItunesRateLimited(
        `iTunes API rate-limited (${response.status})`,
        retryAfter,
      );
    }

    if (response.status >= 500) {
      if (attempt === 0) {
        await sleep(1500);
        continue;
      }
      throw new Error(`iTunes API error ${response.status}`);
    }

    if (!response.ok) throw new Error(`iTunes API error ${response.status}`);

    const data = (await response.json()) as { results?: RawResult[] };
    return (data.results ?? []).map(parseApp);
  }
}

// ── Fallback: App Store SSR + Lookup API ─────────────────────────────────

let lastSsrRequest = 0;

async function fetchSsrPage(keyword: string, country: string): Promise<unknown> {
  const maxRetries = 3;

  for (let attempt = 0; ; attempt++) {
    // Rate limit: at least 1 second between SSR requests. Capped at 1 s so
    // a backwards clock jump can never stall the fallback.
    const wait = 1000 - (Date.now() - lastSsrRequest);
    if (wait > 0) await sleep(Math.min(wait, 1000));

    const url = `https://apps.apple.com/${country.toLowerCase()}/iphone/search?${new URLSearchParams({ term: keyword })}`;
    try {
      const response = await fetch(url, {
        headers: SSR_HEADERS,
        signal: AbortSignal.timeout(30_000),
      });
      lastSsrRequest = Date.now();

      if (!response.ok) {
        if (response.status >= 500 && attempt < maxRetries - 1) {
          await sleep(2 ** attempt * 1000);
          continue;
        }
        throw new Error(`SSR error ${response.status}`);
      }

      const html = await response.text();
      const match = html.match(
        /<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/,
      );
      if (!match) {
        throw new Error("App Store SSR: serialized-server-data script tag not found");
      }
      return JSON.parse(match[1]);
    } catch (err) {
      // Connection errors and timeouts retry with exponential backoff
      if (
        (err instanceof TypeError || (err as Error).name === "TimeoutError") &&
        attempt < maxRetries - 1
      ) {
        await sleep(2 ** attempt * 1000);
        continue;
      }
      throw err;
    }
  }
}

interface SsrInner {
  shelves?: Array<{ items?: Array<{ lockup?: { adamId?: number | null } }> }>;
  nextPage?: { results?: Array<{ id?: number; type?: string }> };
}

/** Ordered app IDs from SSR JSON: shelf lockups first, then nextPage apps. */
function extractSsrAppIds(ssrData: unknown): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();

  const inner = (ssrData as { data?: Array<{ data?: SsrInner }> }).data?.[0]?.data;
  if (!inner) return ids;

  for (const shelf of inner.shelves ?? []) {
    for (const item of shelf.items ?? []) {
      const adamId = item.lockup?.adamId;
      if (adamId && !seen.has(Number(adamId))) {
        ids.push(Number(adamId));
        seen.add(Number(adamId));
      }
    }
  }

  for (const result of inner.nextPage?.results ?? []) {
    if (result.type !== "apps") continue;
    if (result.id && !seen.has(Number(result.id))) {
      ids.push(Number(result.id));
      seen.add(Number(result.id));
    }
  }

  return ids;
}

/** Batch-fetch apps via the Lookup API in chunks of 50. Partial data on chunk failure. */
async function batchLookup(
  trackIds: number[],
  country: string,
): Promise<Map<number, CompetitorApp>> {
  const result = new Map<number, CompetitorApp>();
  const chunkSize = 50;

  for (let start = 0; start < trackIds.length; start += chunkSize) {
    const chunk = trackIds.slice(start, start + chunkSize);
    const params = new URLSearchParams({ id: chunk.join(","), country });
    try {
      const response = await fetch(`${LOOKUP_URL}?${params}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Lookup error ${response.status}`);
      const data = (await response.json()) as { results?: RawResult[] };
      for (const r of data.results ?? []) {
        if (r.trackId) result.set(r.trackId, parseApp(r));
      }
    } catch {
      // Continue with the next chunk – partial data is better than none
    }
  }

  return result;
}

async function ssrSearch(
  keyword: string,
  country: string,
  limit: number,
): Promise<CompetitorApp[]> {
  const ssrData = await fetchSsrPage(keyword, country);
  const allIds = extractSsrAppIds(ssrData);

  // SSR returned no results – valid for niche keywords
  if (allIds.length === 0) return [];

  const targetIds = allIds.slice(0, limit);
  const lookupMap = await batchLookup(targetIds, country);

  if (lookupMap.size === 0) {
    throw new SearchApiUnavailableError(
      "App Store search data is temporarily unavailable. " +
        "Both the iTunes Search API and the Lookup API failed. " +
        "Please try again in a few minutes.",
    );
  }

  // Ranking order, only apps that Lookup returned
  return targetIds
    .filter((id) => lookupMap.has(id))
    .map((id) => lookupMap.get(id)!);
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Search for iOS apps matching a keyword. Tries the iTunes Search API,
 * falls back to App Store SSR scraping + Lookup hydration. Rate-limit
 * signals propagate (SSR would be throttled too); if both sources fail,
 * throws SearchApiUnavailableError.
 */
export async function searchApps(
  keyword: string,
  country = "us",
  limit = 25,
): Promise<CompetitorApp[]> {
  try {
    return await itunesSearch(keyword, country, limit);
  } catch (err) {
    if (err instanceof ItunesRateLimited) throw err;
  }

  try {
    return await ssrSearch(keyword, country, limit);
  } catch (err) {
    if (err instanceof SearchApiUnavailableError) throw err;
    throw new SearchApiUnavailableError(
      "App Store search data is temporarily unavailable. " +
        "Both the iTunes Search API and the App Store website " +
        "returned errors. Please try again in a few minutes.",
    );
  }
}

// ── Adaptive rate limiter (from aso/throttle.py) ─────────────────────────

const BASE_DELAY_MS = 3000; // ~20 requests/minute floor
const MAX_DELAY_MS = 20_000;
const GROWTH_FACTOR = 1.6;
const DECAY_AFTER_OK = 3;
const DECAY_FACTOR = 0.7;
const SLOWED_DOWN_RATIO = 1.5;

/**
 * Adaptive backoff between iTunes calls: grows on failures (honouring
 * Retry-After), decays back toward the base after consecutive successes.
 */
export class AdaptiveRateLimiter {
  private delay = BASE_DELAY_MS;
  private failures = 0;
  private successes = 0;

  get currentDelayMs(): number {
    return this.delay;
  }

  get consecutiveFailures(): number {
    return this.failures;
  }

  get isSlowedDown(): boolean {
    return this.delay > BASE_DELAY_MS * SLOWED_DOWN_RATIO;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.successes++;
    if (this.successes >= DECAY_AFTER_OK && this.delay > BASE_DELAY_MS) {
      this.delay = Math.max(BASE_DELAY_MS, this.delay * DECAY_FACTOR);
      this.successes = 0;
    }
  }

  recordFailure(retryAfterSeconds?: number): void {
    this.failures++;
    this.successes = 0;
    if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
      this.delay = Math.min(
        MAX_DELAY_MS,
        Math.max(this.delay, retryAfterSeconds * 1000),
      );
    } else {
      this.delay = Math.min(MAX_DELAY_MS, this.delay * GROWTH_FACTOR);
    }
  }
}
