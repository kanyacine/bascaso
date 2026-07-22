// Ported from respectaso aso/dashboard_summary.py – aggregation logic behind
// the Storefront summary (current vs potential downloads, rank distribution,
// movers). One adaptation: rankDistribution only buckets t5/t10/t20/t25/
// unranked, since this app fetches 25 search results, not respectaso's
// t50/t100/t200 (impossible here).

import { estimateDownloads } from "@/lib/aso/downloads";

export interface SummaryInput {
  keyword: string;
  popularity: number | null;
  rank: number | null; // 1-based rank in search results, null = not ranked in the fetched top 25
  previousRank: number | null; // rank at the previous observation, null when unknown/unranked
  hasPrevious: boolean; // whether a previous observation exists at all
  classification: string;
}

export interface DownloadInterval {
  low: number;
  high: number;
}

export interface RankDistribution {
  t5: number;
  t10: number;
  t20: number;
  t25: number;
  unranked: number;
}

export interface StorefrontSummary {
  totalKeywords: number;
  rankingKeywords: number;
  bestRank: number | null;
  inTop20: number;
  movers: { up: number; down: number };
  downloads: DownloadInterval | null;
  headroom: DownloadInterval | null;
  topPerformer: { keyword: string; rank: number | null; low: number; high: number; popularity: number | null } | null;
  biggestGap: { keyword: string; rank: number | null; popularity: number; headroomLow: number; headroomHigh: number } | null;
}

const ZERO: DownloadInterval = { low: 0, high: 0 };

/** (low, high) estimated daily downloads at the keyword's CURRENT rank. */
export function downloadIntervalAtRank(
  popularity: number | null,
  rank: number | null,
  country: string,
): DownloadInterval {
  if (popularity === null || rank === null || rank < 1 || rank > 20) return ZERO;
  const { positions } = estimateDownloads(popularity, country);
  const p = positions[rank - 1];
  return { low: p.downloadsLow, high: p.downloadsHigh };
}

/** (low, high) estimated daily downloads at rank #1 – the ceiling, regardless of current rank. */
function potentialInterval(popularity: number | null, country: string): DownloadInterval {
  if (popularity === null) return ZERO;
  const { positions } = estimateDownloads(popularity, country);
  const p = positions[0];
  return { low: p.downloadsLow, high: p.downloadsHigh };
}

export function computeStorefrontSummary(
  items: SummaryInput[],
  country: string,
  includeDownloads: boolean,
): StorefrontSummary {
  const ranks: number[] = [];
  let inTop20 = 0;
  let up = 0;
  let down = 0;

  for (const item of items) {
    if (item.rank !== null) {
      ranks.push(item.rank);
      if (item.rank <= 20) inTop20++;
    }
    if (item.hasPrevious && item.previousRank !== null && item.rank !== null) {
      const delta = item.previousRank - item.rank;
      if (delta > 0) up++;
      else if (delta < 0) down++;
    }
  }

  const base = {
    totalKeywords: items.length,
    rankingKeywords: ranks.length,
    bestRank: ranks.length ? Math.min(...ranks) : null,
    inTop20,
    movers: { up, down },
  };

  if (!includeDownloads) {
    return { ...base, downloads: null, headroom: null, topPerformer: null, biggestGap: null };
  }

  let totalLow = 0;
  let totalHigh = 0;
  let potentialLow = 0;
  let potentialHigh = 0;
  let bestHigh = -1;
  let topPerformer: StorefrontSummary["topPerformer"] = null;
  let biggestGapScore = -1;
  let biggestGap: StorefrontSummary["biggestGap"] = null;

  for (const entry of items) {
    const current = downloadIntervalAtRank(entry.popularity, entry.rank, country);
    const potential = potentialInterval(entry.popularity, country);
    totalLow += current.low;
    totalHigh += current.high;
    potentialLow += potential.low;
    potentialHigh += potential.high;

    // Top performer: highest current downloads (high-end as tiebreaker).
    if (current.high > bestHigh) {
      bestHigh = current.high;
      if (current.high > 0) {
        topPerformer = {
          keyword: entry.keyword,
          rank: entry.rank,
          low: current.low,
          high: current.high,
          popularity: entry.popularity,
        };
      }
    }

    // Biggest gap: largest headroom (downloads at #1 minus at current rank),
    // restricted to keywords with meaningful popularity.
    const gap = potential.high - current.high;
    if (gap > biggestGapScore && entry.popularity !== null && entry.popularity >= 5) {
      biggestGapScore = gap;
      biggestGap = {
        keyword: entry.keyword,
        rank: entry.rank,
        popularity: entry.popularity,
        headroomLow: Math.max(0, potential.low - current.high),
        headroomHigh: gap,
      };
    }
  }

  // Headroom = potential - current, clipped to >= 0. The cross-over (low
  // against total high, high against total low) avoids negative ranges
  // when the two intervals overlap.
  const headroom: DownloadInterval = {
    low: Math.max(0, potentialLow - totalHigh),
    high: Math.max(0, potentialHigh - totalLow),
  };

  return {
    ...base,
    downloads: { low: totalLow, high: totalHigh },
    headroom,
    topPerformer,
    biggestGap,
  };
}

export function classificationDistribution(items: SummaryInput[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const item of items) {
    const key = item.classification || "Moderate";
    dist[key] = (dist[key] ?? 0) + 1;
  }
  return dist;
}

export function rankDistribution(items: SummaryInput[]): RankDistribution {
  const dist: RankDistribution = { t5: 0, t10: 0, t20: 0, t25: 0, unranked: 0 };
  for (const item of items) {
    const rank = item.rank;
    if (rank === null) dist.unranked++;
    else if (rank <= 5) dist.t5++;
    else if (rank <= 10) dist.t10++;
    else if (rank <= 20) dist.t20++;
    else if (rank <= 25) dist.t25++;
    else dist.unranked++; // defensive: beyond the fetched top 25
  }
  return dist;
}

/** Render a downloads number, mirroring respectaso's `_format_dl_number`. */
export function formatDownloadNumber(value: number | null): string {
  const n = value === null || Number.isNaN(value) ? 0 : value;
  if (n <= 0) return "0";
  if (n >= 1000) {
    const s = (n / 1000).toFixed(1);
    return (s.endsWith(".0") ? s.slice(0, -2) : s) + "K";
  }
  if (n < 1) return n.toFixed(1);
  if (n < 10) {
    const s = n.toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  }
  return String(Math.round(n));
}

function isZeroOrLess(value: number | null): boolean {
  return value === null || value <= 0;
}

/** Render a (low, high) interval as e.g. '~120–180' (no '/day' suffix). */
export function formatInterval(low: number | null, high: number | null): string {
  if (isZeroOrLess(low) && isZeroOrLess(high)) return "—";
  const lo = formatDownloadNumber(low);
  const hi = formatDownloadNumber(high);
  if (lo === hi || isZeroOrLess(low)) return `~${hi}`;
  return `~${lo}–${hi}`;
}
