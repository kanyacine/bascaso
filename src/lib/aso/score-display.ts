// Display helpers for keyword opportunity badges.

export type OpportunityTone = "green" | "amber" | "red";

// Bands follow the classification thresholds: ≥ 55 is "Good Target"
// territory, ≤ 25 is "Avoid".
export function opportunityTone(opportunity: number): OpportunityTone {
  if (opportunity >= 55) return "green";
  if (opportunity >= 26) return "amber";
  return "red";
}

/** Client-side mirror of the server keyword normalization. */
export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}
