import { describe, expect, it } from "vitest";
import {
  buildKeywordField,
  harvestCandidates,
  shouldFailForThinSample,
  strategyValue,
} from "@/lib/ai/workflows/keyword-research";

describe("harvestCandidates", () => {
  it("tokenizes competitor titles, lowercases, dedupes against seeds, drops short words", () => {
    const out = harvestCandidates(["habit tracker"], ["Habit Tracker – Daily Planner", "Streaks: habit & goals"]);
    expect(out).toContain("daily");
    expect(out).toContain("planner");
    expect(out).toContain("streaks");
    expect(out).not.toContain("habit tracker"); // already a seed
    expect(out.every((k) => k.length >= 3)).toBe(true);
  });
});

describe("buildKeywordField", () => {
  const mk = (keyword: string, opportunity: number) => ({
    keyword, opportunity,
    source: "seed" as const, popularity: null, difficulty: 1,
    classification: "Good Target", relevant: true,
  });

  it("keeps short function words that complete a query (to do list)", () => {
    expect(buildKeywordField([mk("to do list", 90)], new Set<string>())).toBe("to,do,list");
  });

  it("never packs words Apple ignores", () => {
    expect(buildKeywordField([mk("habit tracker for iphone", 90)], new Set<string>())).toBe("habit,tracker");
  });

  it("title words cost nothing and are not repeated in the field", () => {
    expect(buildKeywordField([mk("habit tracker", 90)], new Set(["habit"]))).toBe("tracker");
  });

  it("counts a shared word once across phrases", () => {
    const field = buildKeywordField([mk("habit tracker", 90), mk("sleep tracker", 85)], new Set<string>());
    expect(field).toBe("habit,tracker,sleep");
  });

  it("emits in phrase-value order even when selection picks cheap words first", () => {
    const field = buildKeywordField([mk("planner", 95), mk("habit", 80)], new Set<string>());
    expect(field).toBe("planner,habit");
  });

  it("tops up with head words of a phrase too big to fit whole", () => {
    const many = Array.from({ length: 30 }, (_, i) => `word${String(i).padStart(2, "0")}`).join(" ");
    const field = buildKeywordField([mk(many, 90)], new Set<string>());
    expect(field.length).toBeLessThanOrEqual(100);
    expect(field.length).toBeGreaterThanOrEqual(90);
    expect(field.startsWith("word00")).toBe(true);
  });
});

describe("strategyValue", () => {
  const mk = (classification: string, opportunity: number) => ({
    keyword: "x", source: "seed" as const, popularity: null,
    difficulty: 1, opportunity, classification, relevant: true,
  });

  it("niche boosts hidden gems over sweet spots, broad does the opposite", () => {
    const gem = mk("Hidden Gem", 80);
    const sweet = mk("Sweet Spot", 80);
    expect(strategyValue(gem, "niche")).toBeGreaterThan(strategyValue(sweet, "niche"));
    expect(strategyValue(sweet, "broad")).toBeGreaterThan(strategyValue(gem, "broad"));
  });

  it("crushes Avoid under every strategy", () => {
    const avoid = mk("Avoid", 100);
    const moderate = mk("Moderate", 50);
    for (const s of ["balanced", "broad", "niche"] as const) {
      expect(strategyValue(avoid, s)).toBeLessThan(strategyValue(moderate, s));
    }
  });

  it("defaults unknown classifications to weight 1", () => {
    expect(strategyValue(mk("???", 40), "balanced")).toBe(40);
  });
});

describe("shouldFailForThinSample (floor + ceiling on a degraded run)", () => {
  it("never fails a clean run (nothing skipped), regardless of how few scored", () => {
    expect(shouldFailForThinSample(0, 0)).toBe(false);
    expect(shouldFailForThinSample(1, 0)).toBe(false);
  });

  it("floor: fails when iTunes caused skips and nothing at all scored", () => {
    expect(shouldFailForThinSample(0, 1)).toBe(true);
    expect(shouldFailForThinSample(0, 8)).toBe(true); // the reviewer's total-outage probe shape
  });

  it("ceiling: fails a non-empty but too-thin sample (1 of 8 scored, 12.5%)", () => {
    expect(shouldFailForThinSample(1, 7)).toBe(true); // the reviewer's 1-survivor-of-8 probe shape
  });

  it("ceiling boundary: exactly 30% passes, just under fails", () => {
    expect(shouldFailForThinSample(3, 7)).toBe(false); // 3/10 = 30% – passes
    expect(shouldFailForThinSample(29, 71)).toBe(true); // 29/100 = 29% – fails
  });

  it("passes a run where throttling only hit after a broad sample was gathered", () => {
    expect(shouldFailForThinSample(20, 10)).toBe(false); // 20/30 ≈ 67%
  });
});
