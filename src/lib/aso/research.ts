// Pure helpers for the "Recherche ASO" tab: input parsing, keyword merging,
// App Store Connect field editing, and result-table sorting.

import { normalizeKeyword } from "@/lib/aso/score-display";
import type { TagScore } from "@/components/keyword-tag-input";

const ASC_FIELD_MAX_LENGTH = 100;

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

export type ResearchSortColumn =
  | "keyword"
  | "popularity"
  | "difficulty"
  | "opportunity"
  | "rank";

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
