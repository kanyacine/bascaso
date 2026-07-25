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

  // Reviewer probe #1 (Critical 1): a total outage – every scoreKeyword call
  // throws – used to "succeed" with 0 candidates / null proposal, and that
  // empty run was persisted into the report history by listRuns (which only
  // lists succeeded runs). It must now fail loudly instead, the way the whole
  // run did before this file's degrade behaviour existed.
  it("fails the run (does not succeed empty) on a total iTunes outage – reviewer probe #1", async () => {
    relevantResponse = allRelevant;
    mockScoreKeyword.mockImplementation(async () => {
      throw new ItunesRateLimited("iTunes API rate-limited (429)");
    });

    const err = await runKeywordResearch(input, () => {}, new AbortController().signal).catch((e) => e);

    expect(err).toBeInstanceOf(WorkflowStepError);
    expect(err.step).toBe("score");
    expect(err.partial.candidates.length).toBe(0);
    expect((err.cause as Error).message).toContain("itunes_unavailable");
    // Circuit breaker: only the 3 seeds are ever attempted (the failure that
    // trips the breaker happens on the 3rd of them) – every harvested
    // candidate the "score" step would otherwise have scored is skipped
    // without a single further call, instead of paying the retry ladder for
    // each of them.
    expect(mockScoreKeyword).toHaveBeenCalledTimes(3);
  });

  // Reviewer probe #2 (Critical 2): 7 of 8 keywords skipped, one survivor –
  // used to produce a one-click-appliable proposal built from a single
  // scored keyword. It must now fail instead (ceiling), never reach the UI.
  it("fails a thin-sample run instead of shipping an applyable proposal from one survivor – reviewer probe #2", async () => {
    relevantResponse = allRelevant;
    mockScoreKeyword.mockImplementation(async (keyword: string) => {
      if (keyword === "habit tracker") return makeScore(keyword);
      throw new ItunesRateLimited("iTunes API rate-limited (429)");
    });

    const err = await runKeywordResearch(input, () => {}, new AbortController().signal).catch((e) => e);

    expect(err).toBeInstanceOf(WorkflowStepError);
    expect(err.step).toBe("score");
    expect(err.partial.candidates.length).toBe(1);
    expect(err.partial.candidates[0].keyword).toBe("habit tracker");
    expect((err.cause as Error).message).toContain("itunes_unavailable");
    // Breaker trips on the 3rd straight failure (daily planner, goals, then
    // the first harvested attempt) – nothing beyond that is even attempted.
    expect(mockScoreKeyword).toHaveBeenCalledTimes(4);
  });

  // Second re-review Critical: shouldFailForThinSample must be fed *attempted*
  // counts only. partial.skippedKeywords also holds keywords the breaker
  // skipped without ever attempting them – a realistic run harvests up to
  // MAX_CANDIDATES worth of those, so a version of this test with only a
  // handful of harvested candidates would pass for the wrong reason (it
  // "encodes the fixture, not the behaviour"). This one harvests a
  // realistic-scale pool (well over 100 unique tokens, capped by
  // MAX_CANDIDATES like a real run) to prove the fix generalizes.
  it("stops attempting once the circuit breaker trips, without paying the retry ladder for the rest – realistic harvest size", async () => {
    seedsResponse = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"];
    relevantResponse = allRelevant;
    // 130 uniquely-named competitor apps – tokenizes to well over the
    // MAX_CANDIDATES - seeds.length = 110 harvested-candidate cap, so the
    // harvested pool is capped exactly the way a real, popular-app run
    // would be, not left artificially small.
    const bigCompetitors = Array.from({ length: 130 }, (_, i) => ({
      trackName: `Zzzword${i}`,
      userRatingCount: 1,
      averageUserRating: 4,
      releaseDate: new Date().toISOString(),
      primaryGenreName: "Productivity",
    }));
    mockScoreKeyword.mockImplementation(async (keyword: string) => {
      if (["s8", "s9", "s10"].includes(keyword)) {
        throw new ItunesRateLimited("iTunes API rate-limited (429)");
      }
      return { ...makeScore(keyword), competitors: bigCompetitors };
    });

    const result = await runKeywordResearch(input, () => {}, new AbortController().signal);

    const scoredSeeds = result.candidates.filter((c) => c.source === "seed").map((c) => c.keyword);
    expect(scoredSeeds).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7"]);
    expect(result.skippedKeywords).toEqual(expect.arrayContaining(["s8", "s9", "s10"]));
    // Well over 100 harvested candidates exist and are marked "relevant",
    // but none of them is ever attempted – the breaker is already open by
    // the time the "score" step runs, so only the 10 seeds cost a call.
    expect(result.skippedKeywords.length).toBeGreaterThan(100);
    expect(mockScoreKeyword).toHaveBeenCalledTimes(10);
    // The reviewer's exact numbers: 7 attempted-and-scored, 3 attempted-and-
    // failed → 7/10 = 70 % ≥ 30 % ceiling on *attempted* keywords – passes.
    // Counting the 100+ never-attempted harvested candidates in the
    // denominator instead (the bug) would give 7/120 ≈ 5.8 % and wrongly fail.
    expect(result.proposal).not.toBeNull();
  });

  it("bounds duration with a wall-clock budget when a cache hit keeps resetting the consecutive-failure counter", async () => {
    // Interleaved cache-hit / throttled-miss pattern: every other call
    // succeeds, so 3 *consecutive* failures never happens and the breaker
    // alone would never trip – only MAX_RUN_DURATION_MS (60 min) bounds this.
    seedsResponse = Array.from({ length: 20 }, (_, i) => `s${i}`);
    relevantResponse = []; // isolate to the seed loop – no harvested attempts to muddy the call count
    let elapsedMs = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => elapsedMs);
    let call = 0;
    mockScoreKeyword.mockImplementation(async (keyword: string) => {
      call++;
      elapsedMs += 5 * 60 * 1000; // each call "takes" 5 simulated minutes
      if (call % 2 === 0) throw new ItunesRateLimited("iTunes API rate-limited (429)");
      return makeScore(keyword);
    });

    try {
      const result = await runKeywordResearch(input, () => {}, new AbortController().signal);
      // 20 calls × 5 min would be 100 min of simulated time – past the 60-min
      // budget – so not every seed can have been attempted.
      expect(mockScoreKeyword.mock.calls.length).toBeLessThan(20);
      expect(result.skippedKeywords.length).toBeGreaterThan(0);
    } finally {
      nowSpy.mockRestore();
    }
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
