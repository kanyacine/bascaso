import { describe, it, expect } from "vitest";
import { normalizeKeyword, opportunityTone } from "@/lib/aso/score-display";

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

describe("normalizeKeyword", () => {
  it("trims and lowercases, matching the server normalization", () => {
    expect(normalizeKeyword("  Fitness App  ")).toBe("fitness app");
    expect(normalizeKeyword("MÉTÉO")).toBe("météo");
    expect(normalizeKeyword("plain")).toBe("plain");
  });
});
