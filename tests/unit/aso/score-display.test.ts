import { describe, it, expect } from "vitest";
import {
  classificationTone,
  difficultyTone,
  normalizeKeyword,
  opportunityTone,
  popularityTone,
  rankTone,
  rankQuality,
} from "@/lib/aso/score-display";

describe("opportunityTone", () => {
  it("is green from 55 up", () => {
    expect(opportunityTone(100)).toBe("green");
    expect(opportunityTone(55)).toBe("green");
  });

  it("is amber between 26 and 54", () => {
    expect(opportunityTone(54)).toBe("amber");
    expect(opportunityTone(26)).toBe("amber");
  });

  it("is red at 25 and below", () => {
    expect(opportunityTone(25)).toBe("red");
    expect(opportunityTone(0)).toBe("red");
  });
});

// Popularity bands mirror the respectaso methodology legend
// (50+ excellent, 30-49 good, 15-29 moderate, 5-14 low, <5 minimal).
describe("popularityTone", () => {
  it("maps the respectaso popularity bands", () => {
    expect(popularityTone(100)).toBe("green");
    expect(popularityTone(50)).toBe("green");
    expect(popularityTone(49)).toBe("lightGreen");
    expect(popularityTone(30)).toBe("lightGreen");
    expect(popularityTone(29)).toBe("yellow");
    expect(popularityTone(15)).toBe("yellow");
    expect(popularityTone(14)).toBe("orange");
    expect(popularityTone(5)).toBe("orange");
    expect(popularityTone(4)).toBe("red");
  });

  it("is muted when popularity is unknown", () => {
    expect(popularityTone(null)).toBe("muted");
  });
});

// Difficulty bands mirror respectaso's difficulty_color property
// (≤15, ≤35, ≤55, ≤75, ≤90, else) – lower is better.
describe("difficultyTone", () => {
  it("maps the respectaso difficulty bands", () => {
    expect(difficultyTone(0)).toBe("green");
    expect(difficultyTone(15)).toBe("green");
    expect(difficultyTone(16)).toBe("lightGreen");
    expect(difficultyTone(35)).toBe("lightGreen");
    expect(difficultyTone(36)).toBe("yellow");
    expect(difficultyTone(55)).toBe("yellow");
    expect(difficultyTone(56)).toBe("orange");
    expect(difficultyTone(75)).toBe("orange");
    expect(difficultyTone(76)).toBe("red");
    expect(difficultyTone(90)).toBe("red");
    expect(difficultyTone(91)).toBe("darkRed");
  });
});

// Verdict colors mirror respectaso's insight map (green targets,
// blue hidden gem, yellow high competition, red avoid, neutral rest).
describe("classificationTone", () => {
  it("maps each classification label, Sweet Spot in a deeper green", () => {
    expect(classificationTone("Sweet Spot")).toBe("darkGreen");
    expect(classificationTone("Good Target")).toBe("green");
    expect(classificationTone("Hidden Gem")).toBe("blue");
    expect(classificationTone("High Competition")).toBe("yellow");
    expect(classificationTone("Moderate")).toBe("muted");
    expect(classificationTone("Low Volume")).toBe("muted");
    expect(classificationTone("Avoid")).toBe("red");
  });

  it("is muted for unknown labels", () => {
    expect(classificationTone("Something Else")).toBe("muted");
  });
});

describe("rankTone", () => {
  it("bands on 10 / 30 / 100, muted when unranked", () => {
    expect(rankTone(1)).toBe("green");
    expect(rankTone(10)).toBe("green");
    expect(rankTone(11)).toBe("lightGreen");
    expect(rankTone(30)).toBe("lightGreen");
    expect(rankTone(31)).toBe("yellow");
    expect(rankTone(100)).toBe("yellow");
    expect(rankTone(101)).toBe("orange");
    expect(rankTone(null)).toBe("muted");
  });
});

describe("rankQuality", () => {
  it("grades on the same bands as rankTone", () => {
    expect(rankQuality(10)).toBe("excellent");
    expect(rankQuality(11)).toBe("strong");
    expect(rankQuality(30)).toBe("strong");
    expect(rankQuality(31)).toBe("moderate");
    expect(rankQuality(100)).toBe("moderate");
    expect(rankQuality(101)).toBe("low");
  });
});

describe("normalizeKeyword", () => {
  it("trims and lowercases, matching the server normalization", () => {
    expect(normalizeKeyword("  Fitness App  ")).toBe("fitness app");
    expect(normalizeKeyword("MÉTÉO")).toBe("météo");
    expect(normalizeKeyword("plain")).toBe("plain");
  });
});
