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
  it("packs unique words, not phrases, and skips words already in the title", () => {
    const ranked = [
      { keyword: "habit tracker", opportunity: 90 },
      { keyword: "habit list", opportunity: 80 },
      { keyword: "routine", opportunity: 70 },
    ].map((k) => ({ ...k, source: "seed" as const, popularity: null, difficulty: 1, classification: "x", relevant: true }));
    const field = buildKeywordField(ranked, new Set(["habit"]));
    expect(field).toBe("tracker,list,routine");
  });

  it("fills toward 100 chars and never exceeds the limit", () => {
    const ranked = Array.from({ length: 40 }, (_, i) => ({
      keyword: `motcle${String(i).padStart(2, "0")}`,
      source: "harvested" as const, popularity: null, difficulty: 1,
      opportunity: 100 - i, classification: "x", relevant: true,
    }));
    const field = buildKeywordField(ranked, new Set<string>());
    expect(field.length).toBeLessThanOrEqual(100);
    expect(field.length).toBeGreaterThanOrEqual(90);
  });
});
