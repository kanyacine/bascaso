// Ported from respectaso aso/scoring.py – single source of truth for
// opportunity scoring and keyword classification. Values must stay
// bit-identical to the Python reference (see tests/unit/aso/parity.test.ts).

// Popularity → estimated daily searches (US App Store baseline).
const POP_TO_SEARCHES: ReadonlyArray<readonly [number, number]> = [
  [5, 1],
  [10, 3],
  [15, 5],
  [20, 10],
  [25, 20],
  [30, 35],
  [35, 55],
  [40, 90],
  [45, 140],
  [50, 200],
  [55, 290],
  [60, 400],
  [65, 550],
  [70, 750],
  [75, 1_100],
  [80, 2_000],
  [85, 4_000],
  [90, 8_000],
  [95, 16_000],
  [100, 32_000],
];

const MAX_SEARCHES = 32_000; // pop=100 baseline

/** Interpolate daily search volume from popularity score. */
export function popToSearches(popularity: number | null | undefined): number {
  if (popularity == null || popularity <= 0) return 0;
  const pts = POP_TO_SEARCHES;
  if (popularity <= pts[0][0]) return pts[0][1] * (popularity / pts[0][0]);
  if (popularity >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  let i = 1;
  while (popularity > pts[i][0]) i++;
  const [p0, s0] = pts[i - 1];
  const [p1, s1] = pts[i];
  return s0 + ((popularity - p0) / (p1 - p0)) * (s1 - s0);
}

/**
 * Calculate opportunity score (0-100).
 *
 * Formula:
 *   volume = log10(1 + daily_searches) / log10(1 + 32000)
 *   gate   = 1 - (difficulty / 100)^2
 *   opportunity = volume × gate × 100
 */
export function calcOpportunity(
  popularity: number | null | undefined,
  difficulty: number,
): number {
  if (!popularity || popularity <= 0) return 0;
  const searches = popToSearches(popularity); // > 0 whenever popularity > 0
  const volume = Math.log10(1 + searches) / Math.log10(1 + MAX_SEARCHES);
  const gate = 1 - (difficulty / 100) ** 2;
  const raw = volume * gate * 100;
  return Math.max(0, Math.min(100, Math.trunc(raw)));
}

export const CLASSIFICATION_LABELS = [
  "Sweet Spot",
  "Hidden Gem",
  "Low Volume",
  "High Competition",
  "Good Target",
  "Avoid",
  "Moderate",
] as const;

export type ClassificationLabel = (typeof CLASSIFICATION_LABELS)[number];

/** Classify a keyword based on popularity, difficulty and opportunity. */
export function classifyKeyword(
  popularity: number,
  difficulty: number,
): ClassificationLabel {
  const opp = calcOpportunity(popularity, difficulty);
  if (popularity >= 40 && difficulty <= 40) return "Sweet Spot";
  if (popularity >= 25 && popularity < 40 && difficulty <= 30 && opp >= 30) {
    return "Hidden Gem";
  }
  if (popularity < 15) return "Low Volume";
  if (difficulty >= 65) return "High Competition";
  if (opp >= 55) return "Good Target";
  if (opp <= 25) return "Avoid";
  return "Moderate";
}
