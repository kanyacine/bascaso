import { describe, it, expect } from "vitest";
import {
  ageScore,
  appComponents,
  momentumScore,
  profileFromResult,
  ratingScore,
  ratingsPerYear,
  volumeScore,
  yearsSince,
} from "@/lib/aso/strength";

const NOW = new Date("2026-07-21T00:00:00Z");

describe("factor curves", () => {
  it("hit their calibration points and clamp", () => {
    expect(volumeScore(0)).toBe(0);
    expect(volumeScore(25)).toBe(2.5);
    expect(volumeScore(2_000)).toBeCloseTo(50, 10);
    expect(volumeScore(1_000_000)).toBe(100);
    expect(volumeScore(5_000_000)).toBe(100);
    expect(momentumScore(500_000)).toBe(100);
    expect(ratingScore(0)).toBe(0);
    expect(ratingScore(3)).toBe(20);
    expect(ratingScore(5)).toBe(100);
    expect(ageScore(0.25)).toBe(5);
    expect(ageScore(3)).toBe(50);
    expect(ageScore(20)).toBe(100);
  });

  it("are continuous across every band edge", () => {
    for (const edge of [50, 200, 500, 2_000, 100_000]) {
      expect(volumeScore(edge * 0.99999)).toBeCloseTo(volumeScore(edge), 2);
    }
  });
});

describe("yearsSince / ratingsPerYear", () => {
  it("counts whole days over 365.25, never negative", () => {
    expect(yearsSince("2025-07-21T00:00:00Z", NOW)).toBeCloseTo(365 / 365.25, 10);
    expect(yearsSince("2027-01-01T00:00:00Z", NOW)).toBe(0);
    expect(yearsSince("not-a-date", NOW)).toBeNull();
    expect(yearsSince("", NOW)).toBeNull();
  });

  it("measures momentum over at least half a year", () => {
    expect(ratingsPerYear(10, 0.01)).toBe(20);
    expect(ratingsPerYear(0, 3)).toBe(0);
    expect(ratingsPerYear(10, null)).toBe(0);
  });
});

describe("appComponents", () => {
  it("scores a brand new app on the title factor only when targeted", () => {
    expect(appComponents({}, { now: NOW })).toEqual({
      volume: 0, momentum: 0, rating: 0, age: 0, title: 100,
    });
    expect(appComponents({}, { targeted: false, titleEvidence: 0.5, now: NOW }).title).toBe(50);
  });

  it("ignores the stars of an app without ratings", () => {
    expect(appComponents({ ratings: 0, average: 5 }, { now: NOW }).rating).toBe(0);
  });

  it("reads an iTunes result", () => {
    expect(
      profileFromResult({ trackName: "X", userRatingCount: 12.7, averageUserRating: 4.2, releaseDate: "2020-01-01" }),
    ).toEqual({ name: "X", ratings: 12, average: 4.2, released: "2020-01-01" });
  });
});
