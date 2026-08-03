import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../helpers/test-db";
import { workflowRuns } from "@/db/schema";
import {
  ItunesUnavailableError,
  WorkflowStepError,
  type KeywordResearchInput,
  type KeywordResearchResult,
  type WorkflowProgress,
} from "@/lib/ai/workflows/keyword-research";

let testDb: ReturnType<typeof createTestDb>;
const mockRun = vi.fn();

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

// Keep the real WorkflowStepError / types so `instanceof` matches in the
// run-manager; only the orchestrator entry point is stubbed.
vi.mock("@/lib/ai/workflows/keyword-research", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/ai/workflows/keyword-research")>();
  return {
    ...actual,
    runKeywordResearch: (...args: unknown[]) => mockRun(...args),
  };
});

const input: KeywordResearchInput = {
  appId: "app-1",
  appAppleId: 123,
  appName: "Habitly",
  country: "us",
  locale: "en-US",
};

// A null proposal now means "failed" (see driveRun's cause-independent
// guard) – this fixture stays proposal:null on purpose for tests exercising
// WorkflowStepError partials (a failure always may carry no proposal) and
// for tests that only need *a* value to resolve/settle the mocked run
// without asserting the final status. Tests that assert `status: "succeeded"`
// use succeededResult below instead.
const emptyResult: KeywordResearchResult = {
  candidates: [],
  proposal: null,
  opportunities: [],
  strategy: "balanced",
  skippedKeywords: [],
};

const succeededResult: KeywordResearchResult = {
  candidates: [
    {
      keyword: "habit tracker",
      source: "seed",
      popularity: 40,
      difficulty: 12,
      opportunity: 60,
      classification: "Good Target",
      relevant: true,
    },
  ],
  proposal: { title: "Habitly", subtitle: "Track habits", keywords: "habit,routine", summary: "ok" },
  opportunities: [],
  strategy: "balanced",
  skippedKeywords: [],
};

function makeDeferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function loadManager() {
  return import("@/lib/ai/workflows/run-manager");
}

beforeEach(() => {
  testDb = createTestDb();
  mockRun.mockReset();
  vi.resetModules();
});

describe("startKeywordResearch", () => {
  it("inserts a running row and refuses a concurrent start for the same app", async () => {
    const deferred = makeDeferred<KeywordResearchResult>();
    mockRun.mockReturnValue(deferred.promise);
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const first = await startKeywordResearch(input);
    expect("runId" in first).toBe(true);
    const runId = (first as { runId: string }).runId;

    const row = getRun(runId);
    expect(row).not.toBeNull();
    expect(row?.status).toBe("running");
    expect(row?.kind).toBe("keyword-research");
    expect(row?.appId).toBe("app-1");
    expect(row?.country).toBe("us");
    expect(row?.locale).toBe("en-US");

    const second = await startKeywordResearch(input);
    expect(second).toEqual({ error: "already_running" });

    // Let the first run finish so the in-flight slot clears.
    deferred.resolve(succeededResult);
    await __whenSettled(runId);
    expect(getRun(runId)?.status).toBe("succeeded");
  });

  it("persists succeeded and the result JSON on success", async () => {
    const result: KeywordResearchResult = {
      candidates: [
        {
          keyword: "habit tracker",
          source: "seed",
          popularity: 40,
          difficulty: 12,
          opportunity: 60,
          classification: "Good Target",
          relevant: true,
        },
      ],
      proposal: { title: "Habitly", subtitle: "Track habits", keywords: "habit,routine", summary: "ok" },
      opportunities: [{ keyword: "habit tracker", signals: [] }],
      strategy: "balanced",
      skippedKeywords: [],
    };
    mockRun.mockResolvedValue(result);
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const started = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(started.runId);

    const row = getRun(started.runId);
    expect(row?.status).toBe("succeeded");
    expect(row?.result).toEqual(result);
    expect(row?.error).toBeNull();
  });

  it("persists failed with the error code and partial result on WorkflowStepError", async () => {
    const partial: KeywordResearchResult = {
      candidates: [
        {
          keyword: "habit tracker",
          source: "seed",
          popularity: null,
          difficulty: 10,
          opportunity: 20,
          classification: "Good Target",
          relevant: false,
        },
      ],
      proposal: null,
      opportunities: [],
      strategy: "balanced",
      skippedKeywords: [],
    };
    mockRun.mockRejectedValue(
      new WorkflowStepError("score", partial, new Error("itunes down")),
    );
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const started = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(started.runId);

    const row = getRun(started.runId);
    expect(row?.status).toBe("failed");
    expect(row?.error).toBe("workflow_step_failed:score");
    expect(row?.step).toBe("score");
    expect(row?.result).toEqual(partial);
  });

  it("records an unexpected non-workflow error as failed", async () => {
    mockRun.mockRejectedValue(new Error("boom"));
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const started = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(started.runId);

    const row = getRun(started.runId);
    expect(row?.status).toBe("failed");
    expect(row?.error).toBe("boom");
  });

  // Regression: a WorkflowStepError's cause (the managed proxy's real rejection) was
  // lost – only the generic "workflow_step_failed:X" message was stored, never
  // translatable on the client through aiErrorMessage. Same mapping as the /api/ai and
  // /api/apps/.../insights routes (classifyAIError).
  it("maps a rate_limited proxy error (WorkflowStepError cause) to the same code the AI routes return", async () => {
    const cause = new Error('429 {"error":{"code":"rate_limited"}}');
    mockRun.mockRejectedValue(new WorkflowStepError("seeds", emptyResult, cause));
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const started = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(started.runId);

    expect(getRun(started.runId)?.error).toBe("ai_rate_limited");
  });

  it("maps an action_exhausted proxy error (WorkflowStepError cause) to ai_action_exhausted", async () => {
    const cause = new Error('429 {"error":{"code":"action_exhausted"}}');
    mockRun.mockRejectedValue(new WorkflowStepError("rank", emptyResult, cause));
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const started = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(started.runId);

    expect(getRun(started.runId)?.error).toBe("ai_action_exhausted");
  });

  it("maps an insufficient_credits proxy error (WorkflowStepError cause) to ai_credits_exhausted", async () => {
    const cause = new Error('402 {"error":{"code":"insufficient_credits"}}');
    mockRun.mockRejectedValue(new WorkflowStepError("compose", emptyResult, cause));
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const started = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(started.runId);

    expect(getRun(started.runId)?.error).toBe("ai_credits_exhausted");
  });

  // Defensive net (the pipeline should never let a raw error through other than
  // WorkflowStepError/AbortError): the same mapping if the contract were broken, rather
  // than the proxy's raw message.
  it("maps a raw rate_limited error via the defensive catch-all branch too", async () => {
    mockRun.mockRejectedValue(new Error('429 {"error":{"code":"rate_limited"}}'));
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const started = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(started.runId);

    expect(getRun(started.runId)?.error).toBe("ai_rate_limited");
  });

  // Re-review, Important: the message was only visible on err.cause, never persisted –
  // classifyAIError returned "unknown", the stored code stayed the generic
  // "workflow_step_failed:score", so there was nothing translatable in the UI.
  it("maps an ItunesUnavailableError (WorkflowStepError cause) to the stable itunes_unavailable code", async () => {
    const cause = new ItunesUnavailableError(
      "itunes_unavailable: only 1/8 attempted keyword(s) could be scored (< 30%) – too thin a sample to propose metadata from",
    );
    mockRun.mockRejectedValue(new WorkflowStepError("score", emptyResult, cause));
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const started = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(started.runId);

    expect(getRun(started.runId)?.error).toBe("itunes_unavailable");
  });

  // Re-review, Critical 1: a null proposal could still be persisted as "succeeded"
  // through another door (e.g. seedsSchema accepting empty strings, filtered out later)
  // that keyword-research.ts's own floor/ceiling does not cover (it only acts when
  // skippedKeywords > 0). The guard is placed once here, independently of the cause.
  it("fails a run that resolved with a null proposal instead of persisting it as succeeded", async () => {
    mockRun.mockResolvedValue(emptyResult); // proposal: null, skippedKeywords: [] – not an iTunes case
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const started = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(started.runId);

    const row = getRun(started.runId);
    expect(row?.status).toBe("failed");
    expect(row?.error).toBe("no_proposal");
    // Not hardcoded to "compose" – see run-manager.ts's comment: this isn't a
    // step throwing, so it doesn't belong to any one step.
    expect(row?.step).toBeNull();
    expect(row?.result).toEqual(emptyResult);
  });

  // Re-review, Important: replaying with a fresh actionId on every retry billed a second
  // credit for the same gesture – the original actionId must be reusable.
  it("mints a fresh actionId and persists it on the row when none is provided", async () => {
    mockRun.mockResolvedValue(succeededResult);
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const started = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(started.runId);

    const row = getRun(started.runId);
    expect(row?.actionId).toEqual(expect.any(String));
    expect(row?.actionId!.length).toBeGreaterThan(0);
    // The same actionId reaches the orchestrator (bills the credit under it).
    expect(mockRun.mock.calls[0][0]).toMatchObject({ actionId: row?.actionId });
  });

  it("reuses a caller-provided actionId (retry) instead of minting a fresh one", async () => {
    mockRun.mockResolvedValue(succeededResult);
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const started = (await startKeywordResearch({ ...input, actionId: "reuse-me" })) as { runId: string };
    await __whenSettled(started.runId);

    expect(getRun(started.runId)?.actionId).toBe("reuse-me");
    expect(mockRun.mock.calls[0][0]).toMatchObject({ actionId: "reuse-me" });
  });

  // Re-review, Important: the free-replay window is measured from the actionId's mint,
  // not from the last run's createdAt. Every retry writes a fresh row while reusing the
  // same action: reading createdAt reset the clock on each hop, and the UI promised a
  // free retry long after the backend's real expiry.
  it("carries the action's mint time across a multi-hop retry chain", async () => {
    mockRun.mockResolvedValue(succeededResult);
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    // Driven clock: without it the three hops share the same millisecond and the test
    // can no longer tell createdAt apart from the mint.
    vi.useFakeTimers();
    const mint = "2026-01-01T12:00:00.000Z";
    vi.setSystemTime(new Date(mint));

    const first = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(first.runId);
    const origin = getRun(first.runId)!;
    expect(origin.createdAt).toBe(mint);
    expect(origin.actionStartedAt).toBe(mint); // first hop: the two coincide

    // Two successive retries on the same action, each with its own createdAt.
    const hops: string[] = [];
    for (const minutes of [20, 40]) {
      vi.setSystemTime(new Date(Date.parse(mint) + minutes * 60_000));
      const retry = (await startKeywordResearch({
        ...input,
        actionId: origin.actionId!,
      })) as { runId: string };
      await __whenSettled(retry.runId);
      const hop = getRun(retry.runId)!;
      hops.push(hop.createdAt);
      expect(hop.actionStartedAt).toBe(mint);
    }
    // The third hop does have its own createdAt: that gap is what reading createdAt
    // hid.
    expect(hops).toEqual(["2026-01-01T12:20:00.000Z", "2026-01-01T12:40:00.000Z"]);
    vi.useRealTimers();
  });

  // Deleting a report must not reopen the window: the mint travels on every row of the
  // chain, so it survives losing the head.
  it("keeps the mint time when the chain's head row is deleted", async () => {
    mockRun.mockResolvedValue(succeededResult);
    const { startKeywordResearch, getRun, deleteRun, __whenSettled } = await loadManager();

    vi.useFakeTimers();
    const mint = "2026-01-01T12:00:00.000Z";
    vi.setSystemTime(new Date(mint));

    const first = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(first.runId);
    const origin = getRun(first.runId)!;

    vi.setSystemTime(new Date(Date.parse(mint) + 10 * 60_000));
    const second = (await startKeywordResearch({
      ...input,
      actionId: origin.actionId!,
    })) as { runId: string };
    await __whenSettled(second.runId);
    expect(deleteRun(first.runId)).toBe(true);

    vi.setSystemTime(new Date(Date.parse(mint) + 20 * 60_000));
    const third = (await startKeywordResearch({
      ...input,
      actionId: origin.actionId!,
    })) as { runId: string };
    await __whenSettled(third.runId);
    expect(getRun(third.runId)?.actionStartedAt).toBe(mint);
    vi.useRealTimers();
  });

  it("writes throttled onProgress updates (step + progress) to the row", async () => {
    const deferred = makeDeferred<KeywordResearchResult>();
    let captured: ((p: WorkflowProgress) => void) | null = null;
    mockRun.mockImplementation(
      (_input: unknown, onProgress: (p: WorkflowProgress) => void) => {
        captured = onProgress;
        return deferred.promise;
      },
    );
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

    const started = (await startKeywordResearch(input)) as { runId: string };
    captured!({ step: "score", done: 2, total: 5 });

    const mid = getRun(started.runId);
    expect(mid?.status).toBe("running");
    expect(mid?.step).toBe("score");
    expect(mid?.progress).toEqual({ step: "score", done: 2, total: 5 });

    deferred.resolve(succeededResult);
    await __whenSettled(started.runId);
    expect(getRun(started.runId)?.status).toBe("succeeded");
  });

  it("bypasses the throttle when the step changes", async () => {
    const deferred = makeDeferred<KeywordResearchResult>();
    let captured: ((p: WorkflowProgress) => void) | null = null;
    mockRun.mockImplementation(
      (_input: unknown, onProgress: (p: WorkflowProgress) => void) => {
        captured = onProgress;
        return deferred.promise;
      },
    );
    const { startKeywordResearch, getRun, __whenSettled } = await loadManager();
    const started = (await startKeywordResearch(input)) as { runId: string };

    captured!({ step: "score", done: 5, total: 5 });
    // New step inside the throttle window – must be persisted anyway.
    captured!({ step: "rank", done: 0, total: 1 });

    expect(getRun(started.runId)?.step).toBe("rank");

    deferred.resolve(emptyResult);
    await __whenSettled(started.runId);
  });
});

describe("failStuckRuns", () => {
  it("fails running rows with no in-flight driver and leaves live runs alone", async () => {
    const deferred = makeDeferred<KeywordResearchResult>();
    mockRun.mockReturnValue(deferred.promise);
    const { startKeywordResearch, getRun, failStuckRuns, __whenSettled } = await loadManager();

    const live = (await startKeywordResearch(input)) as { runId: string };
    testDb.insert(workflowRuns).values({
      id: "stuck-run", kind: "keyword-research", appId: "app-2",
      country: "us", locale: "en-US", status: "running",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }).run();

    expect(failStuckRuns()).toBe(1);
    expect(getRun("stuck-run")?.status).toBe("failed");
    expect(getRun("stuck-run")?.error).toBe("server_restarted");
    expect(getRun(live.runId)?.status).toBe("running");

    deferred.resolve(emptyResult);
    await __whenSettled(live.runId);
  });
});

describe("cancelRun", () => {
  it("aborts the run and persists cancelled", async () => {
    mockRun.mockImplementation(
      (_input: unknown, _onProgress: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const { startKeywordResearch, cancelRun, getRun, __whenSettled } =
      await loadManager();

    const started = (await startKeywordResearch(input)) as { runId: string };
    expect(getRun(started.runId)?.status).toBe("running");

    expect(cancelRun(started.runId)).toBe(true);
    await __whenSettled(started.runId);

    expect(getRun(started.runId)?.status).toBe("cancelled");
    // A settled or unknown run cannot be cancelled again.
    expect(cancelRun(started.runId)).toBe(false);
    expect(cancelRun("does-not-exist")).toBe(false);
  });
});

describe("getRun / getLatestRun", () => {
  it("getRun returns null for an unknown id", async () => {
    const { getRun } = await loadManager();
    expect(getRun("nope")).toBeNull();
  });

  it("getLatestRun returns the newest run for an app, null otherwise", async () => {
    mockRun.mockResolvedValue(succeededResult);
    const { startKeywordResearch, getLatestRun, __whenSettled } = await loadManager();

    expect(getLatestRun("app-1")).toBeNull();

    const started = (await startKeywordResearch(input)) as { runId: string };
    await __whenSettled(started.runId);

    const latest = getLatestRun("app-1");
    expect(latest?.id).toBe(started.runId);
    expect(latest?.status).toBe("succeeded");
    expect(getLatestRun("other-app")).toBeNull();
  });
});

describe("deleteRun / deleteAllRuns", () => {
  const row = (id: string, appId: string) => ({
    id, kind: "keyword-research", appId, country: "us", locale: "en-US",
    status: "succeeded", createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  it("deleteRun removes one row and reports whether it existed", async () => {
    const { deleteRun, getRun } = await loadManager();
    testDb.insert(workflowRuns).values([row("r1", "app-1"), row("r2", "app-1")]).run();
    expect(deleteRun("r1")).toBe(true);
    expect(deleteRun("nope")).toBe(false);
    expect(getRun("r1")).toBeNull();
    expect(getRun("r2")).not.toBeNull();
  });

  it("deleteAllRuns clears every row and returns the count", async () => {
    const { deleteAllRuns, getRun } = await loadManager();
    testDb.insert(workflowRuns).values([row("a", "app-1"), row("b", "app-2")]).run();
    expect(deleteAllRuns()).toBe(2);
    expect(getRun("a")).toBeNull();
    expect(getRun("b")).toBeNull();
  });
});

describe("listRuns", () => {
  it("returns only succeeded runs matching appId + country + locale, newest first", async () => {
    const { listRuns } = await loadManager();
    const base = {
      kind: "keyword-research", appId: "app-1", country: "us", locale: "en-US",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    testDb.insert(workflowRuns).values([
      { ...base, id: "r-old", status: "succeeded", createdAt: "2026-01-01T00:00:00.000Z" },
      { ...base, id: "r-new", status: "succeeded", createdAt: "2026-01-02T00:00:00.000Z" },
      { ...base, id: "r-running", status: "running" },
      { ...base, id: "r-other-locale", status: "succeeded", locale: "fr-FR" },
      { ...base, id: "r-other-country", status: "succeeded", country: "fr" },
      { ...base, id: "r-other-app", status: "succeeded", appId: "app-2" },
    ]).run();

    const runs = listRuns("app-1", { country: "us", locale: "en-US" });
    expect(runs.map((r) => r.id)).toEqual(["r-new", "r-old"]);
  });
});

describe("event emission isolation (regression)", () => {
  // A throwing listener models the SSE route enqueuing to a controller that a
  // disconnected client has already closed. An unguarded emit would propagate
  // that throw into driveRun's catch-all and overwrite a succeeded row.
  it("keeps a succeeded run persisted when a workflowEvents listener throws", async () => {
    const { workflowEvents } = await import("@/lib/ai/workflows/events");
    const throwing = (event: { status: string }) => {
      if (event.status !== "running") throw new Error("controller is already closed");
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    workflowEvents.on("workflow", throwing);
    try {
      mockRun.mockResolvedValue(succeededResult);
      const { startKeywordResearch, getRun, __whenSettled } = await loadManager();

      const started = (await startKeywordResearch(input)) as { runId: string };
      await expect(__whenSettled(started.runId)).resolves.toBeUndefined();

      const row = getRun(started.runId);
      expect(row?.status).toBe("succeeded");
      expect(row?.error).toBeNull();
    } finally {
      workflowEvents.off("workflow", throwing);
      errorSpy.mockRestore();
    }
  });

  it("emitWorkflowEvent swallows a throwing listener instead of propagating", async () => {
    const { workflowEvents, emitWorkflowEvent } = await import(
      "@/lib/ai/workflows/events"
    );
    const throwing = () => {
      throw new Error("boom");
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    workflowEvents.on("workflow", throwing);
    try {
      expect(() =>
        emitWorkflowEvent({ runId: "r1", status: "succeeded" }),
      ).not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      workflowEvents.off("workflow", throwing);
      errorSpy.mockRestore();
    }
  });
});
