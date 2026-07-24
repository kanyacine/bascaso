import { describe, expect, it } from "vitest";
import {
  buildComposePrompt,
  buildRelevancePrompt,
  buildSeedsPrompt,
  composeSchema,
  relevanceSchema,
  seedsSchema,
} from "@/lib/ai/workflows/prompts";

describe("buildSeedsPrompt", () => {
  it("includes app name, storefront, locale and competitor titles", () => {
    const { system, prompt, schema } = buildSeedsPrompt({
      appName: "Habitly",
      country: "fr",
      locale: "fr-FR",
      title: "Habitly – Habits",
      subtitle: "Track your day",
      currentKeywords: "habit,routine",
      competitorTitles: ["Streaks", "Way of Life"],
    });
    expect(system).toContain("App Store Optimization");
    expect(prompt).toContain("App: Habitly");
    expect(prompt).toContain("Storefront country: fr");
    expect(prompt).toContain("Target language: fr-FR");
    expect(prompt).toContain("Current title: Habitly – Habits");
    expect(prompt).toContain("Current subtitle: Track your day");
    expect(prompt).toContain("Current keyword field: habit,routine");
    expect(prompt).toContain("Streaks | Way of Life");
    expect(schema).toBe(seedsSchema);
  });

  it("omits optional lines when not provided", () => {
    const { prompt } = buildSeedsPrompt({
      appName: "Habitly",
      country: "us",
      locale: "en-US",
      competitorTitles: [],
    });
    expect(prompt).not.toContain("Current title:");
    expect(prompt).not.toContain("Current subtitle:");
    expect(prompt).not.toContain("Current keyword field:");
    expect(prompt).not.toContain("Description (excerpt):");
  });

  it("truncates the description to 1500 characters", () => {
    const description = "x".repeat(3000);
    const { prompt } = buildSeedsPrompt({
      appName: "Habitly",
      country: "us",
      locale: "en-US",
      description,
      competitorTitles: [],
    });
    const line = prompt.split("\n").find((l) => l.startsWith("Description (excerpt):"))!;
    const body = line.replace("Description (excerpt): ", "");
    expect(body.length).toBe(1500);
  });

  it("orients the seed generation per strategy", () => {
    const base = { appName: "Habitly", country: "us", locale: "en-US", competitorTitles: [] };
    expect(buildSeedsPrompt({ ...base, strategy: "niche" }).prompt).toContain("long-tail");
    expect(buildSeedsPrompt({ ...base, strategy: "broad" }).prompt).toContain("wide appeal");
    expect(buildSeedsPrompt(base).prompt).not.toContain("long-tail");
  });
});

describe("buildRelevancePrompt", () => {
  it("numbers the keywords, asks for indices and excludes brand names", () => {
    const { prompt, schema } = buildRelevancePrompt({
      appName: "Habitly",
      subtitle: "Track your day",
      description: "y".repeat(2000),
      keywords: ["habit tracker", "daily planner"],
    });
    expect(prompt).toContain("App: Habitly");
    expect(prompt).toContain("0. habit tracker");
    expect(prompt).toContain("1. daily planner");
    expect(prompt).toContain("Competitor brand names are not relevant.");
    expect(prompt).toContain("Return the numbers");
    const line = prompt.split("\n").find((l) => l.startsWith("Description (excerpt):"))!;
    expect(line.replace("Description (excerpt): ", "").length).toBe(600);
    expect(schema).toBe(relevanceSchema);
  });
});

describe("buildComposePrompt", () => {
  it("lists the top keywords with their scores", () => {
    const { prompt, schema } = buildComposePrompt({
      appName: "Habitly",
      locale: "fr-FR",
      title: "Habitly",
      topKeywords: [
        { keyword: "planner", popularity: 42, difficulty: 10, opportunity: 88 },
        { keyword: "routine", popularity: null, difficulty: 20, opportunity: 70 },
      ],
    });
    expect(prompt).toContain("Target language: fr-FR");
    expect(prompt).toContain("- planner (pop 42, diff 10, opp 88)");
    expect(prompt).toContain("- routine (pop ?, diff 20, opp 70)");
    expect(prompt).toContain("max 30 characters");
    expect(prompt).not.toContain("- keywords:");
    expect(schema).toBe(composeSchema);
  });
});

describe("schemas reject an empty object", () => {
  it("seedsSchema is a loose sanity bound – the workflow caps the count", () => {
    expect(seedsSchema.safeParse({}).success).toBe(false);
    expect(seedsSchema.safeParse({ seeds: [] }).success).toBe(false);
    expect(seedsSchema.safeParse({ seeds: ["a", "b", "c"] }).success).toBe(true);
  });
  it("relevanceSchema accepts indices and rejects strings", () => {
    expect(relevanceSchema.safeParse({}).success).toBe(false);
    expect(relevanceSchema.safeParse({ relevant: ["habit"] }).success).toBe(false);
    expect(relevanceSchema.safeParse({ relevant: [0, 2] }).success).toBe(true);
  });
  it("composeSchema requires title, subtitle and summary", () => {
    expect(composeSchema.safeParse({}).success).toBe(false);
    expect(composeSchema.safeParse({ title: "a", subtitle: "b" }).success).toBe(false);
    expect(composeSchema.safeParse({ title: "a", subtitle: "b", summary: "s" }).success).toBe(true);
  });
});
