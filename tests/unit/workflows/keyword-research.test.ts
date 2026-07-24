import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (names prefixed with `mock` so vitest allows them in factories) ──
const mockSearchApps = vi.fn();
const mockScoreKeyword = vi.fn();
const mockGetLanguageModelForTask = vi.fn();
const mockGenerateObject = vi.fn();

vi.mock("@/lib/aso/itunes", () => ({
  searchApps: (...args: unknown[]) => mockSearchApps(...args),
}));
vi.mock("@/lib/aso/score-service", () => ({
  scoreKeyword: (...args: unknown[]) => mockScoreKeyword(...args),
}));
vi.mock("@/lib/ai/provider-factory", () => ({
  getLanguageModelForTask: (...args: unknown[]) => mockGetLanguageModelForTask(...args),
}));
vi.mock("@/lib/ai/structured-output", () => ({
  generateObjectWithRepair: (...args: unknown[]) => mockGenerateObject(...args),
}));

import {
  MAX_CANDIDATES,
  runKeywordResearch,
  WorkflowStepError,
  type KeywordResearchInput,
} from "@/lib/ai/workflows/keyword-research";

const input: KeywordResearchInput = {
  appId: "app1",
  appAppleId: 123,
  appName: "Habitly",
  country: "us",
  locale: "en-US",
  title: "Habitly",
  subtitle: "Track habits",
  description: "Build better habits every day",
  currentKeywords: "habit,routine",
};

// opportunity/popularity table driving the ranking assertions
const SCORES: Record<string, { opportunity: number; popularity: number | null }> = {
  "habit tracker": { opportunity: 50, popularity: 30 },
  "daily planner": { opportunity: 90, popularity: 40 },
  goals: { opportunity: 20, popularity: 10 },
  daily: { opportunity: 60, popularity: 50 },
  planner: { opportunity: 95, popularity: 20 },
  pro: { opportunity: 10, popularity: 5 },
  routine: { opportunity: 70, popularity: 60 },
  habit: { opportunity: 80, popularity: 70 },
};

function makeScore(keyword: string) {
  const s = SCORES[keyword] ?? { opportunity: 0, popularity: 0 };
  return {
    keyword,
    country: "us",
    popularity: s.popularity,
    difficulty: 15,
    opportunity: s.opportunity,
    classification: "Good Target",
    fetchedAt: Date.now(),
    stale: false,
    rank: null,
    resultCount: 1,
    details: {
      titleMatchCount: 0,
      overrideReason: null,
      isBrandKeyword: false,
      brandName: null,
      rawTotal: 10,
      totalScore: 10,
      avgReviews: 100,
      medianReviews: 100,
    },
    competitors: [
      {
        trackName: "Some Competitor",
        userRatingCount: 100,
        averageUserRating: 4,
        releaseDate: new Date().toISOString(),
        primaryGenreName: "Productivity",
      },
    ],
    previous: null,
  };
}

// Configurable LLM responses (reset per test)
let seedsResponse: string[];
let relevantResponse: string[];
let composeResponses: Array<{ title: string; subtitle: string; keywords: string; summary: string }>;

beforeEach(() => {
  mockSearchApps.mockReset();
  mockScoreKeyword.mockReset();
  mockGetLanguageModelForTask.mockReset();
  mockGenerateObject.mockReset();

  seedsResponse = ["habit tracker", "daily planner", "goals"];
  relevantResponse = ["planner", "daily planner", "habit"];
  composeResponses = [
    { title: "Habitly", subtitle: "Daily habit planner", keywords: "planner,routine,daily", summary: "Focus on planner." },
  ];

  mockSearchApps.mockResolvedValue([
    { trackName: "Daily Planner Pro" },
    { trackName: "Routine Habit" },
  ]);
  mockScoreKeyword.mockImplementation(async (keyword: string) => makeScore(keyword));
  mockGetLanguageModelForTask.mockResolvedValue({
    model: {},
    providerId: "openai",
    modelId: "gpt-4o-mini",
    tier: "byok",
  });
  mockGenerateObject.mockImplementation(async ({ prompt }: { prompt: string }) => {
    if (prompt.includes("Generate 20 distinct")) return { object: { seeds: seedsResponse } };
    if (prompt.includes("Return the exact subset")) return { object: { relevant: relevantResponse } };
    if (prompt.includes("Propose App Store metadata")) {
      const next = composeResponses.shift();
      if (!next) throw new Error("no more compose responses");
      return { object: next };
    }
    throw new Error(`unexpected prompt: ${prompt.slice(0, 40)}`);
  });
});

describe("runKeywordResearch – nominal run", () => {
  it("ranks relevant candidates first (opportunity desc) and proposes metadata within limits", async () => {
    const progress: string[] = [];
    const result = await runKeywordResearch(
      input,
      (p) => progress.push(p.step),
      new AbortController().signal,
    );

    // Candidate order: seeds then harvested tokens (deduped)
    const keywords = result.candidates.map((c) => c.keyword);
    expect(keywords).toEqual(
      expect.arrayContaining(["habit tracker", "daily planner", "goals", "daily", "planner", "pro", "routine", "habit"]),
    );

    // Relevant first, opportunity desc within the relevant group
    expect(result.candidates[0].keyword).toBe("planner");
    expect(result.candidates.slice(0, 3).every((c) => c.relevant)).toBe(true);
    expect(result.candidates.slice(3).every((c) => !c.relevant)).toBe(true);
    expect(result.candidates[0].opportunity).toBeGreaterThanOrEqual(result.candidates[1].opportunity);
    expect(result.candidates[1].opportunity).toBeGreaterThanOrEqual(result.candidates[2].opportunity);
    // non-relevant group opportunity desc
    expect(result.candidates[3].opportunity).toBeGreaterThanOrEqual(result.candidates[4].opportunity);

    // Proposal within ASC limits
    expect(result.proposal).not.toBeNull();
    expect(result.proposal!.title.length).toBeLessThanOrEqual(30);
    expect(result.proposal!.subtitle.length).toBeLessThanOrEqual(30);
    expect(result.proposal!.keywords.length).toBeLessThanOrEqual(100);
    expect(result.proposal!.summary).toBe("Focus on planner.");

    // Opportunity signals for the top 10 (only 8 here)
    expect(result.opportunities.length).toBe(8);
    expect(result.opportunities[0].signals.length).toBeGreaterThan(0);

    // Progress covered every step; three LLM calls (seeds + 1 relevance batch + 1 compose)
    expect(progress).toContain("context");
    expect(progress).toContain("score");
    expect(progress).toContain("report");
    expect(mockGenerateObject).toHaveBeenCalledTimes(3);
  });

  it("retries compose when the title is too long and rebuilds an over-long keyword field", async () => {
    composeResponses = [
      { title: "x".repeat(40), subtitle: "Sub", keywords: "irrelevant", summary: "s1" },
      { title: "Short", subtitle: "Sub", keywords: "x".repeat(150), summary: "s2" },
    ];

    const result = await runKeywordResearch(input, () => {}, new AbortController().signal);

    expect(result.proposal!.title).toBe("Short");
    expect(result.proposal!.title.length).toBeLessThanOrEqual(30);
    expect(result.proposal!.keywords.length).toBeLessThanOrEqual(100);
    // rebuilt greedily from ranked candidates → starts with the top keyword
    expect(result.proposal!.keywords.startsWith("planner")).toBe(true);
    // seeds + relevance + 2 compose calls
    expect(mockGenerateObject).toHaveBeenCalledTimes(4);
  });

  it("hard-caps title and subtitle when the compose retry still overshoots the limit", async () => {
    // Both the initial compose and the retry return over-limit metadata, so the
    // LLM never self-corrects – the deterministic cap must still guarantee ≤30.
    composeResponses = [
      { title: "x".repeat(40), subtitle: "y".repeat(45), keywords: "planner", summary: "s1" },
      { title: "super long habit tracking planner title", subtitle: "z".repeat(38), keywords: "planner", summary: "s2" },
    ];

    const result = await runKeywordResearch(input, () => {}, new AbortController().signal);

    expect(result.proposal!.title.length).toBeLessThanOrEqual(30);
    expect(result.proposal!.subtitle.length).toBeLessThanOrEqual(30);
    // seeds + relevance + 2 compose calls (initial + one retry)
    expect(mockGenerateObject).toHaveBeenCalledTimes(4);
  });
});

describe("runKeywordResearch – scoring failure", () => {
  it("wraps a scoring error in WorkflowStepError with step 'score' and partial candidates", async () => {
    let calls = 0;
    mockScoreKeyword.mockImplementation(async (keyword: string) => {
      calls++;
      if (calls === 2) throw new Error("itunes unavailable");
      return makeScore(keyword);
    });

    const err = await runKeywordResearch(input, () => {}, new AbortController().signal).catch((e) => e);

    expect(err).toBeInstanceOf(WorkflowStepError);
    expect(err.step).toBe("score");
    expect(err.partial.candidates.length).toBe(1);
    expect(err.partial.candidates[0].keyword).toBe("habit tracker");
    expect(err.cause).toBeInstanceOf(Error);
  });
});

describe("runKeywordResearch – abort during scoring", () => {
  it("propagates an AbortError without wrapping it", async () => {
    const controller = new AbortController();
    let calls = 0;
    mockScoreKeyword.mockImplementation(async (keyword: string) => {
      calls++;
      if (calls === 1) controller.abort();
      return makeScore(keyword);
    });

    const err = await runKeywordResearch(input, () => {}, controller.signal).catch((e) => e);

    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
    expect(err).not.toBeInstanceOf(WorkflowStepError);
  });
});

describe("MAX_CANDIDATES", () => {
  it("is exported as the documented hard cap", () => {
    expect(MAX_CANDIDATES).toBe(120);
  });
});
