import { describe, expect, it } from "vitest";
import { buildKeywordField, harvestCandidates } from "@/lib/ai/workflows/keyword-research";

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
  it("greedily packs top keywords under 100 chars, skipping words already in the title", () => {
    const ranked = [
      { keyword: "planner", opportunity: 90 }, { keyword: "habit", opportunity: 80 },
      { keyword: "routine", opportunity: 70 },
    ].map((k) => ({ ...k, source: "seed" as const, popularity: null, difficulty: 1, classification: "x", relevant: true }));
    const field = buildKeywordField(ranked, new Set(["habit"]));
    expect(field.includes("habit")).toBe(false);
    expect(field.length).toBeLessThanOrEqual(100);
    expect(field.startsWith("planner")).toBe(true);
  });
});
