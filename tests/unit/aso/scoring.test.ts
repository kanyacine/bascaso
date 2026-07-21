import { describe, it, expect } from "vitest";
import {
  calcOpportunity,
  classifyKeyword,
  popToSearches,
} from "@/lib/aso/scoring";

// Ported from respectaso aso/tests/test_scoring.py – expected values must
// stay identical to the Python reference implementation.

describe("popToSearches", () => {
  it("returns 0 for zero popularity", () => {
    expect(popToSearches(0)).toBe(0);
  });

  it("returns 0 for negative popularity", () => {
    expect(popToSearches(-5)).toBe(0);
  });

  it("returns 0 for null popularity", () => {
    expect(popToSearches(null)).toBe(0);
  });

  it("returns exact table points", () => {
    expect(popToSearches(50)).toBe(200);
    expect(popToSearches(100)).toBe(32_000);
    expect(popToSearches(5)).toBe(1);
  });

  it("interpolates between points", () => {
    expect(popToSearches(55)).toBe(290);
    const mid = popToSearches(52);
    expect(mid).toBeGreaterThan(200);
    expect(mid).toBeLessThan(290);
  });

  it("scales below the first point", () => {
    const val = popToSearches(2);
    expect(val).toBeGreaterThan(0);
    expect(val).toBeLessThan(1);
  });

  it("caps above the last point", () => {
    expect(popToSearches(110)).toBe(32_000);
  });
});

describe("calcOpportunity", () => {
  it("returns 0 when popularity is zero", () => {
    expect(calcOpportunity(0, 0)).toBe(0);
    expect(calcOpportunity(0, 50)).toBe(0);
    expect(calcOpportunity(0, 100)).toBe(0);
  });

  it("returns 0 at max difficulty", () => {
    expect(calcOpportunity(100, 100)).toBe(0);
    expect(calcOpportunity(50, 100)).toBe(0);
  });

  it("returns 100 for the ideal keyword", () => {
    expect(calcOpportunity(100, 0)).toBe(100);
  });

  it("matches the reference score table", () => {
    expect(calcOpportunity(100, 30)).toBe(91);
    expect(calcOpportunity(100, 50)).toBe(75);
    expect(calcOpportunity(100, 70)).toBe(51);
    expect(calcOpportunity(100, 90)).toBe(18);
    expect(calcOpportunity(80, 30)).toBe(66);
    expect(calcOpportunity(50, 0)).toBe(51);
    expect(calcOpportunity(50, 50)).toBe(38);
    expect(calcOpportunity(30, 20)).toBe(33);
    expect(calcOpportunity(10, 10)).toBe(13);
  });

  it("is monotonically increasing in popularity", () => {
    let prev = 0;
    for (let pop = 10; pop <= 100; pop += 10) {
      const opp = calcOpportunity(pop, 30);
      expect(opp).toBeGreaterThanOrEqual(prev);
      prev = opp;
    }
  });

  it("is monotonically decreasing in difficulty", () => {
    let prev = 100;
    for (let diff = 0; diff <= 100; diff += 10) {
      const opp = calcOpportunity(50, diff);
      expect(opp).toBeLessThanOrEqual(prev);
      prev = opp;
    }
  });

  it("clamps to 0-100", () => {
    expect(calcOpportunity(1, 99)).toBeGreaterThanOrEqual(0);
    expect(calcOpportunity(100, 0)).toBeLessThanOrEqual(100);
  });

  it("returns 0 for negative popularity", () => {
    expect(calcOpportunity(-10, 50)).toBe(0);
  });
});

describe("classifyKeyword", () => {
  it("classifies a sweet spot", () => {
    expect(classifyKeyword(50, 30)).toBe("Sweet Spot");
  });

  it("classifies a good target", () => {
    // pop=85, diff=50 → opp=59 → Good Target
    expect(classifyKeyword(85, 50)).toBe("Good Target");
  });

  it("classifies a hidden gem", () => {
    // pop=30 → 35 daily searches, diff=20 → easy to rank
    expect(classifyKeyword(30, 20)).toBe("Hidden Gem");
  });

  it("requires real volume for a hidden gem", () => {
    // pop=20 → only 10 daily searches – NOT a hidden gem
    expect(classifyKeyword(20, 20)).not.toBe("Hidden Gem");
  });

  it("requires minimum opportunity for a hidden gem", () => {
    // pop=25, diff=29 → opp≈6 – too low to be a hidden gem
    expect(classifyKeyword(25, 29)).not.toBe("Hidden Gem");
  });

  it("keeps hidden gem with good opportunity", () => {
    // pop=35, diff=15 → high opp → still a hidden gem
    expect(classifyKeyword(35, 15)).toBe("Hidden Gem");
  });

  it("classifies low volume", () => {
    expect(classifyKeyword(10, 50)).toBe("Low Volume");
  });

  it("classifies high competition", () => {
    expect(classifyKeyword(60, 70)).toBe("High Competition");
  });

  it("classifies extreme competition", () => {
    // period tracker case: pop=97, diff=84 → High Competition
    expect(classifyKeyword(97, 84)).toBe("High Competition");
  });

  it("classifies avoid", () => {
    expect(classifyKeyword(20, 60)).toBe("Avoid");
  });

  it("classifies moderate", () => {
    expect(classifyKeyword(35, 45)).toBe("Moderate");
  });

  it("classifies zero popularity as low volume", () => {
    expect(classifyKeyword(0, 50)).toBe("Low Volume");
  });
});
