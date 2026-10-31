import { describe, it, expect } from "vitest";
import { dailySearches, downloadsAt, ttrAt } from "@/lib/aso/downloads";
import {
  appStrength,
  calcOpportunity,
  classifyKeyword,
  effectiveDifficulty,
  hasRealDemand,
  popToSearches,
  rankFromGap,
  RANK_BY_GAP,
  reachableRank,
  scoreForDownloads,
  titleCarries,
  topSpotOpportunity,
  typicalLanding,
} from "@/lib/aso/scoring";
import { NEW_APP, type AppProfile } from "@/lib/aso/strength";

// Invariants of the respectaso 798335f opportunity model. Exact values
// against the Python reference live in parity.test.ts.

const BIG: AppProfile = {
  name: "Photo Editor Max",
  ratings: 1_400_000,
  average: 4.8,
  released: "2012-06-01T08:00:00Z",
};

describe("popToSearches", () => {
  it("returns 0 for zero, negative and null popularity", () => {
    expect(popToSearches(0)).toBe(0);
    expect(popToSearches(-5)).toBe(0);
    expect(popToSearches(null)).toBe(0);
  });

  it("returns the Apple-anchored table points", () => {
    expect(popToSearches(1)).toBe(1);
    expect(popToSearches(40)).toBe(70);
    expect(popToSearches(50)).toBe(280);
    expect(popToSearches(100)).toBe(300_000);
  });

  it("interpolates linearly and caps above 100", () => {
    expect(popToSearches(42.5)).toBeCloseTo(105, 10);
    expect(popToSearches(110)).toBe(300_000);
  });
});

describe("dailySearches", () => {
  it("scales the US curve by the storefront's market size", () => {
    expect(dailySearches(50)).toBe(280);
    expect(dailySearches(50, "us")).toBe(280);
    expect(dailySearches(50, "fr")).toBeCloseTo(280 * 0.22, 10);
  });

  it("gives an unknown storefront the smallest market, not the US", () => {
    expect(dailySearches(50, "zz")).toBeLessThan(dailySearches(50, "lu"));
  });
});

describe("ttrAt", () => {
  it("returns the table at whole ranks and never rises with depth", () => {
    expect(ttrAt(1)).toBe(0.3);
    expect(ttrAt(10)).toBe(0.013);
    expect(ttrAt(20)).toBe(0.0007);
    let prev = Infinity;
    for (let r = 1; r <= 250; r += 0.25) {
      const v = ttrAt(r);
      expect(v).toBeLessThanOrEqual(prev);
      expect(v).toBeGreaterThan(0);
      prev = v;
    }
  });

  it("is continuous at #20", () => {
    expect(ttrAt(20.0001)).toBeCloseTo(ttrAt(20), 6);
  });
});

describe("scoreForDownloads", () => {
  it("scores 50 at one download a day and 20 points a decade", () => {
    expect(scoreForDownloads(1)).toBe(50);
    expect(scoreForDownloads(10)).toBe(70);
    expect(scoreForDownloads(0.1)).toBe(30);
    expect(scoreForDownloads(0)).toBe(0);
  });

  it("clamps to 0-100", () => {
    expect(scoreForDownloads(1e9)).toBe(100);
    expect(scoreForDownloads(1e-9)).toBe(0);
  });
});

describe("app strength", () => {
  it("rates a brand new app on its targeted title alone (10/70 of 100)", () => {
    expect(appStrength()).toBeCloseTo(100 / 7, 10);
    expect(appStrength(NEW_APP)).toBeCloseTo(100 / 7, 10);
  });

  it("treats an app whose store data is unread as new", () => {
    expect(appStrength({ ...BIG, known: false })).toBeCloseTo(100 / 7, 10);
  });

  it("makes a big app stronger and its difficulty easier", () => {
    expect(appStrength(BIG)).toBeGreaterThan(80);
    expect(effectiveDifficulty(60)).toBe(60);
    expect(effectiveDifficulty(60, BIG)).toBeLessThan(60);
    expect(effectiveDifficulty(10, BIG)).toBe(0);
  });
});

describe("rank model", () => {
  it("returns the table at its points and stays flat below the first", () => {
    for (const [gap, rank] of RANK_BY_GAP) expect(rankFromGap(gap)).toBeCloseTo(rank, 10);
    expect(rankFromGap(-80)).toBe(RANK_BY_GAP[0][1]);
  });

  it("never gets better for a harder keyword, up to the deepest rank", () => {
    let prev = 0;
    for (let gap = -60; gap <= 120; gap += 0.5) {
      const r = rankFromGap(gap);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    expect(rankFromGap(500)).toBe(250);
  });

  it("lets a better real rank win, and a real rank with the keyword in the title stand", () => {
    const app: AppProfile = { name: "Budget Planner Pro", ratings: 6_500, average: 4.7, released: "2018-05-01" };
    const model = reachableRank(95, { app });
    expect(model).toBeGreaterThan(2);
    expect(model).toBeLessThan(140);
    expect(reachableRank(95, { app, appRank: 2, keyword: "expense tracker" })).toBe(2);
    expect(reachableRank(95, { app, appRank: 140, keyword: "expense tracker" })).toBe(model);
    expect(reachableRank(95, { app, appRank: 140, keyword: "budget planner" })).toBe(140);
    expect(titleCarries(app, "planner budget")).toBe(true);
  });

  it("never shows a typical landing better than the effective rank", () => {
    for (let d = 0; d <= 100; d += 5) {
      expect(typicalLanding(d).rank).toBeGreaterThanOrEqual(Math.trunc(rankFromGap(d - appStrength()) + 0.5));
    }
  });
});

describe("calcOpportunity", () => {
  it("returns 0 without popularity", () => {
    expect(calcOpportunity(0, 0)).toBe(0);
    expect(calcOpportunity(-10, 50)).toBe(0);
    expect(calcOpportunity(null, 50)).toBe(0);
  });

  it("is a plain function of the expected downloads", () => {
    const d = downloadsAt(60, reachableRank(40), "us");
    expect(calcOpportunity(60, 40)).toBe(scoreForDownloads(d));
  });

  it("rises with popularity and falls with difficulty", () => {
    let prev = -1;
    for (let pop = 1; pop <= 100; pop++) {
      const v = calcOpportunity(pop, 40);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    prev = 101;
    for (let diff = 0; diff <= 100; diff++) {
      const v = calcOpportunity(60, diff);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it("is worth more in a bigger storefront and to a stronger app", () => {
    expect(calcOpportunity(60, 40, { country: "us" })).toBeGreaterThan(
      calcOpportunity(60, 40, { country: "lu" }),
    );
    expect(calcOpportunity(60, 60, { app: BIG })).toBeGreaterThan(calcOpportunity(60, 60));
  });

  it("never exceeds what #1 is worth", () => {
    for (const pop of [20, 45, 70, 95]) {
      for (const diff of [0, 30, 70]) {
        expect(calcOpportunity(pop, diff, { app: BIG })).toBeLessThanOrEqual(topSpotOpportunity(pop));
      }
    }
  });
});

describe("classifyKeyword", () => {
  it("is Low Volume when #1 brings under a download a day, for every app", () => {
    expect(hasRealDemand(1)).toBe(false);
    expect(classifyKeyword(1, 0)).toBe("Low Volume");
    expect(classifyKeyword(1, 0, { app: BIG })).toBe("Low Volume");
    expect(classifyKeyword(0, 50)).toBe("Low Volume");
  });

  it("follows the opportunity bands when there is demand", () => {
    for (const pop of [30, 45, 60, 80, 100]) {
      for (const diff of [0, 20, 40, 60, 80, 100]) {
        const opp = calcOpportunity(pop, diff);
        const label = classifyKeyword(pop, diff);
        if (!hasRealDemand(pop)) expect(label).toBe("Low Volume");
        else if (opp >= 70) expect(label).toBe("Sweet Spot");
        else if (opp >= 50) expect(label).toBe("Good Target");
        else if (opp >= 30) expect(label).toBe("Supporting");
        else expect(label).toBe("Worth Climbing");
      }
    }
  });

  it("reads Sweet Spot for a huge easy keyword", () => {
    expect(classifyKeyword(90, 10)).toBe("Sweet Spot");
  });
});
