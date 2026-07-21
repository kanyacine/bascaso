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
  | "green"
  | "lightGreen"
  | "yellow"
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

// Mirrors respectaso's insight color map.
const CLASSIFICATION_TONES: Record<string, ScoreTone> = {
  "Sweet Spot": "green",
  "Good Target": "green",
  "Hidden Gem": "blue",
  "High Competition": "yellow",
  Avoid: "red",
};

export function classificationTone(classification: string): ScoreTone {
  return CLASSIFICATION_TONES[classification] ?? "muted";
}

// ponytail: top 10 ≈ first results page, top 50 still findable – no
// respectaso equivalent, rank there is plain white.
export function rankTone(rank: number | null): ScoreTone {
  if (rank === null || rank > 50) return "muted";
  return rank <= 10 ? "green" : "yellow";
}

/** Client-side mirror of the server keyword normalization. */
export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}
