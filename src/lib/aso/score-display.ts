// Display helpers for keyword opportunity badges.

export type OpportunityTone = "green" | "amber" | "red";

// Bands follow the classification thresholds: ≥ 55 is "Good Target"
// territory, ≤ 25 is "Avoid".
export function opportunityTone(opportunity: number): OpportunityTone {
  if (opportunity >= 55) return "green";
  if (opportunity >= 26) return "amber";
  return "red";
}

export type ScoreTone =
  | "darkGreen"
  | "green"
  | "lightGreen"
  | "yellow"
  | "amber"
  | "orange"
  | "red"
  | "darkRed"
  | "blue"
  | "muted";

// Bands mirror the respectaso methodology legend: 50+ excellent,
// 30-49 good, 15-29 moderate, 5-14 low, <5 minimal.
export function popularityTone(popularity: number | null): ScoreTone {
  if (popularity === null) return "muted";
  if (popularity >= 50) return "green";
  if (popularity >= 30) return "lightGreen";
  if (popularity >= 15) return "yellow";
  if (popularity >= 5) return "orange";
  return "red";
}

// Bands mirror respectaso's difficulty_color property – lower is better.
export function difficultyTone(difficulty: number): ScoreTone {
  if (difficulty <= 15) return "green";
  if (difficulty <= 35) return "lightGreen";
  if (difficulty <= 55) return "yellow";
  if (difficulty <= 75) return "orange";
  if (difficulty <= 90) return "red";
  return "darkRed";
}

// Mirrors respectaso's insight color map, except Sweet Spot gets a
// deeper green than Good Target to rank above it visually.
const CLASSIFICATION_TONES: Record<string, ScoreTone> = {
  "Sweet Spot": "darkGreen",
  "Good Target": "green",
  "Hidden Gem": "blue",
  "High Competition": "yellow",
  Avoid: "red",
};

export function classificationTone(classification: string): ScoreTone {
  return CLASSIFICATION_TONES[classification] ?? "muted";
}

// Bands mirror respectaso's "Your App Rank" card.
export function rankTone(rank: number | null): ScoreTone {
  if (rank === null) return "muted";
  if (rank <= 10) return "green";
  if (rank <= 30) return "lightGreen";
  if (rank <= 100) return "yellow";
  return "orange";
}

export type RankQuality = "excellent" | "strong" | "moderate" | "low";

/** Plain-language grade for a rank, on the same bands as `rankTone`. */
export function rankQuality(rank: number): RankQuality {
  if (rank <= 10) return "excellent";
  if (rank <= 30) return "strong";
  if (rank <= 100) return "moderate";
  return "low";
}

/** Theme-aware text classes for the respectaso score tones. */
export const TONE_TEXT: Record<ScoreTone, string> = {
  darkGreen: "text-green-700 dark:text-green-500",
  green: "text-green-600 dark:text-green-400",
  lightGreen: "text-green-500 dark:text-green-300",
  yellow: "text-yellow-600 dark:text-yellow-400",
  amber: "text-amber-600 dark:text-amber-400",
  orange: "text-orange-600 dark:text-orange-400",
  red: "text-red-600 dark:text-red-400",
  darkRed: "text-red-700 dark:text-red-300",
  blue: "text-blue-600 dark:text-blue-400",
  muted: "text-muted-foreground",
};

/** Theme-aware tinted badge classes matching TONE_TEXT hues. */
export const TONE_BADGE: Record<ScoreTone, string> = {
  darkGreen: "bg-green-500/15 text-green-700 dark:text-green-500",
  green: "bg-green-500/15 text-green-600 dark:text-green-400",
  lightGreen: "bg-green-500/10 text-green-500 dark:text-green-300",
  yellow: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  darkRed: "bg-red-500/20 text-red-700 dark:text-red-300",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  muted: "bg-muted text-muted-foreground",
};

/** Solid meter/segment classes matching TONE_TEXT hues. */
export const TONE_BAR: Record<ScoreTone, string> = {
  darkGreen: "bg-green-700",
  green: "bg-green-500",
  lightGreen: "bg-green-400",
  yellow: "bg-yellow-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  darkRed: "bg-red-700",
  blue: "bg-blue-500",
  muted: "bg-muted-foreground",
};

/** Client-side mirror of the server keyword normalization. */
export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}
