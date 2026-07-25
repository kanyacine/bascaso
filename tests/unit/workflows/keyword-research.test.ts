import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (names prefixed with `mock` so vitest allows them in factories) ──
const mockSearchApps = vi.fn();
const mockScoreKeyword = vi.fn();
const mockGetLanguageModelForTask = vi.fn();
const mockGenerateObject = vi.fn();

// importOriginal préserve ItunesRateLimited / SearchApiUnavailableError réelles –
// seule searchApps est stubbée. Le SUT en a besoin pour classer les échecs
// itunes rencontrés via scoreKeyword (voir tests "iTunes throttle").
vi.mock("@/lib/aso/itunes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aso/itunes")>();
  return {
    ...actual,
    searchApps: (...args: unknown[]) => mockSearchApps(...args),
  };
});
vi.mock("@/lib/aso/score-service", () => ({
  scoreKeyword: (...args: unknown[]) => mockScoreKeyword(...args),
}));
vi.mock("@/lib/ai/provider-factory", () => ({
  getLanguageModelForTask: (...args: unknown[]) => mockGetLanguageModelForTask(...args),
}));
vi.mock("@/lib/ai/structured-output", () => ({
  generateObjectWithRepair: (...args: unknown[]) => mockGenerateObject(...args),
}));

import { ItunesRateLimited, SearchApiUnavailableError } from "@/lib/aso/itunes";
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
let relevantResponse: number[];
let composeResponses: Array<{ title: string; subtitle: string; summary: string }>;

beforeEach(() => {
  mockSearchApps.mockReset();
  mockScoreKeyword.mockReset();
  mockGetLanguageModelForTask.mockReset();
  mockGenerateObject.mockReset();

  seedsResponse = ["habit tracker", "daily planner", "goals"];
  // Judged order: habit tracker(0), daily planner(1), goals(2),
  // some(3), competitor(4), daily(5), planner(6), pro(7), routine(8), habit(9)
  relevantResponse = [6, 1, 9]; // planner, daily planner, habit
  composeResponses = [
    { title: "Habitly", subtitle: "Stay focused", summary: "Focus on planner." },
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
    if (prompt.includes("Return the numbers")) return { object: { relevant: relevantResponse } };
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

    // Seeds all kept (scored in expand); only relevant harvested got scored.
    const keywords = result.candidates.map((c) => c.keyword);
    expect(keywords).toEqual(["planner", "daily planner", "habit", "habit tracker", "goals"]);
    expect(keywords).not.toContain("some");
    expect(keywords).not.toContain("routine");
    expect(result.candidates.slice(0, 3).every((c) => c.relevant)).toBe(true);
    expect(result.candidates.slice(3).every((c) => !c.relevant)).toBe(true);
    // 3 seeds + 2 relevant harvested – the 5 irrelevant harvested cost no search.
    expect(mockScoreKeyword).toHaveBeenCalledTimes(5);
    // Relevance runs before scoring.
    expect(progress.indexOf("relevance")).toBeLessThan(progress.indexOf("score"));

    // Proposal within ASC limits
    expect(result.proposal).not.toBeNull();
    expect(result.proposal!.title.length).toBeLessThanOrEqual(30);
    expect(result.proposal!.subtitle.length).toBeLessThanOrEqual(30);
    expect(result.proposal!.keywords.length).toBeLessThanOrEqual(100);
    expect(result.proposal!.summary).toBe("Focus on planner.");
    // Packed from the relevant candidates (planner, daily planner, habit),
    // words from the capped title/subtitle excluded.
    expect(result.proposal!.keywords).toBe("planner,daily,habit");

    // Opportunity signals for the top 10 (only 5 here)
    expect(result.opportunities.length).toBe(5);
    expect(result.opportunities[0].signals.length).toBeGreaterThan(0);

    // Progress covered every step; three LLM calls (seeds + 1 relevance batch + 1 compose)
    expect(progress).toContain("context");
    expect(progress).toContain("score");
    expect(progress).toContain("report");
    expect(mockGenerateObject).toHaveBeenCalledTimes(3);
  });

  it("retries compose when the title is too long and still packs the keyword field", async () => {
    composeResponses = [
      { title: "x".repeat(40), subtitle: "Sub", summary: "s1" },
      { title: "Short", subtitle: "Sub", summary: "s2" },
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
      { title: "x".repeat(40), subtitle: "y".repeat(45), summary: "s1" },
      { title: "super long habit tracking planner title", subtitle: "z".repeat(38), summary: "s2" },
    ];

    const result = await runKeywordResearch(input, () => {}, new AbortController().signal);

    expect(result.proposal!.title.length).toBeLessThanOrEqual(30);
    expect(result.proposal!.subtitle.length).toBeLessThanOrEqual(30);
    // seeds + relevance + 2 compose calls (initial + one retry)
    expect(mockGenerateObject).toHaveBeenCalledTimes(4);
  });
});

describe("runKeywordResearch – strategy", () => {
  it("niche reranks hidden gems first and packs them first in the field", async () => {
    const CLASSES: Record<string, string> = {
      planner: "Sweet Spot",
      habit: "Hidden Gem",
    };
    mockScoreKeyword.mockImplementation(async (keyword: string) => ({
      ...makeScore(keyword),
      classification: CLASSES[keyword] ?? "Good Target",
    }));

    const result = await runKeywordResearch(
      { ...input, strategy: "niche" },
      () => {},
      new AbortController().signal,
    );

    // niche: habit 80×1.6=128 > daily planner 90×1.0=90 > planner 95×0.9=85.5
    expect(result.candidates.slice(0, 3).map((c) => c.keyword)).toEqual([
      "habit", "daily planner", "planner",
    ]);
    expect(result.proposal!.keywords).toBe("habit,daily,planner");
    expect(result.strategy).toBe("niche"); // recorded for the history chip
  });
});

describe("runKeywordResearch – scoring failure", () => {
  it("wraps a scoring error in WorkflowStepError with step 'expand' and partial candidates", async () => {
    let calls = 0;
    mockScoreKeyword.mockImplementation(async (keyword: string) => {
      calls++;
      if (calls === 2) throw new Error("itunes unavailable");
      return makeScore(keyword);
    });

    const err = await runKeywordResearch(input, () => {}, new AbortController().signal).catch((e) => e);

    expect(err).toBeInstanceOf(WorkflowStepError);
    expect(err.step).toBe("expand");
    expect(err.partial.candidates.length).toBe(1);
    expect(err.partial.candidates[0].keyword).toBe("habit tracker");
    expect(err.cause).toBeInstanceOf(Error);
  });

  it("wraps a harvested-scoring error with step 'score' and the seeds as partial", async () => {
    let calls = 0;
    mockScoreKeyword.mockImplementation(async (keyword: string) => {
      calls++;
      if (calls === 4) throw new Error("itunes unavailable"); // first relevant harvested
      return makeScore(keyword);
    });
    const err = await runKeywordResearch(input, () => {}, new AbortController().signal).catch((e) => e);
    expect(err).toBeInstanceOf(WorkflowStepError);
    expect(err.step).toBe("score");
    expect(err.partial.candidates.length).toBe(3); // the three scored seeds
  });
});

describe("runKeywordResearch – iTunes throttle degrades instead of failing", () => {
  // Le crédit managé est débité au premier appel LLM ("seeds", étape 2) – tout
  // ce qui suit (expand, score) tourne sur un crédit déjà dépensé. Un double
  // 429 iTunes qui abortait le workflow ici gaspillait donc ce crédit sans
  // rien livrer. La marque "relevant" pour tout index judgé isole le test de
  // l'arithmétique d'index (voir commentaire de relevantResponse plus haut).
  const allRelevant = Array.from({ length: 30 }, (_, i) => i);

  it("skips a seed whose scoring stays iTunes-rate-limited and still completes with the rest", async () => {
    relevantResponse = allRelevant;
    mockScoreKeyword.mockImplementation(async (keyword: string) => {
      if (keyword === "daily planner") {
        throw new ItunesRateLimited("iTunes API rate-limited (429)");
      }
      return makeScore(keyword);
    });

    const result = await runKeywordResearch(input, () => {}, new AbortController().signal);

    expect(result.skippedKeywords).toEqual(["daily planner"]);
    const keywords = result.candidates.map((c) => c.keyword);
    expect(keywords).not.toContain("daily planner");
    expect(keywords).toContain("habit tracker");
    expect(keywords).toContain("goals");
    // The run still reaches compose – the whole point of degrading rather
    // than aborting is that the already-spent credit buys something.
    expect(result.proposal).not.toBeNull();
  });

  it("skips a harvested candidate whose scoring finds both iTunes sources down and still completes", async () => {
    relevantResponse = allRelevant;
    mockScoreKeyword.mockImplementation(async (keyword: string) => {
      if (keyword === "planner") {
        throw new SearchApiUnavailableError("both search paths down");
      }
      return makeScore(keyword);
    });

    const result = await runKeywordResearch(input, () => {}, new AbortController().signal);

    expect(result.skippedKeywords).toEqual(["planner"]);
    const keywords = result.candidates.map((c) => c.keyword);
    expect(keywords).not.toContain("planner");
    expect(keywords).toContain("habit"); // another harvested candidate, still scored
    expect(result.proposal).not.toBeNull();
  });

  it("still wraps a non-throttle scoring error in WorkflowStepError (regression: does not swallow real bugs)", async () => {
    mockScoreKeyword.mockImplementation(async (keyword: string) => {
      if (keyword === "daily planner") throw new Error("db write failed");
      return makeScore(keyword);
    });

    const err = await runKeywordResearch(input, () => {}, new AbortController().signal).catch((e) => e);

    expect(err).toBeInstanceOf(WorkflowStepError);
    expect(err.step).toBe("expand");
    expect(err.partial.skippedKeywords).toEqual([]);
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

describe("runKeywordResearch – Apple FM input guard", () => {
  it("rejects a CJK prompt that fits the char budget but not the token budget", async () => {
    mockGetLanguageModelForTask.mockResolvedValue({
      model: {}, providerId: "apple-fm", modelId: "apple-fm", tier: "local",
      maxInputChars: 12_000,
    });
    const err = await runKeywordResearch(
      // ~3 200 CJK chars ≈ 3 200 tokens > 3 000, yet far under 12 000 chars.
      { ...input, currentKeywords: "習".repeat(3200) },
      () => {},
      new AbortController().signal,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(WorkflowStepError);
    expect(err.step).toBe("seeds");
    expect((err.cause as Error).message).toBe("workflow_input_too_large");
  });
});
