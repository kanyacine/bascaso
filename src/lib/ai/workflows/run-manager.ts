// Workflow run manager: one running keyword-research per app, persisted to
// the workflow_runs table, driven fire-and-forget with throttled progress
// updates and SSE events. Mirrors the in-flight-dedup pattern in
// src/lib/aso/score-service.ts (keyed by appId here) so a second start for
// an app already running is refused instead of racing.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { workflowRuns } from "@/db/schema";
import { ulid } from "@/lib/ulid";
import {
  ItunesUnavailableError,
  runKeywordResearch,
  WorkflowStepError,
  type KeywordResearchInput,
  type KeywordResearchResult,
  type WorkflowProgress,
  type WorkflowStepId,
} from "@/lib/ai/workflows/keyword-research";
import { emitWorkflowEvent } from "@/lib/ai/workflows/events";
import { classifyAIError } from "@/lib/ai/provider-factory";
// Source unique du mapping catégorie → code (voir ai-error.ts) : l'UI d'un run lit
// le Set qui en dérive, donc les deux côtés ne peuvent plus diverger.
import { MANAGED_ERROR_CODE_BY_CATEGORY } from "@/lib/ai/ai-error";


/** Code stocké dans workflow_runs.error : un échec du proxy managé connu
 *  devient le même code que les routes AI renvoient ; un ItunesUnavailableError
 *  (floor/ceiling – voir keyword-research.ts) devient le code maison stable
 *  "itunes_unavailable" plutôt que le message générique "workflow_step_failed:X".
 *  Toute autre erreur (bug interne…) garde son message d'origine – comportement
 *  inchangé, utile pour le debug serveur, jamais montré tel quel côté client. */
function workflowErrorCode(cause: unknown, fallback: string): string {
  if (cause instanceof ItunesUnavailableError) return "itunes_unavailable";
  return MANAGED_ERROR_CODE_BY_CATEGORY[classifyAIError(cause)] ?? fallback;
}

// Progress can fire once per scored keyword; coalesce DB writes/events so a
// long score step doesn't hammer SQLite. The final status write is never
// throttled.
const PROGRESS_THROTTLE_MS = 500;

/** A workflow_runs row with its `progress`/`result` JSON columns parsed. */
export interface WorkflowRunView {
  id: string;
  kind: string;
  appId: string;
  country: string;
  locale: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  step: WorkflowStepId | null;
  progress: WorkflowProgress | null;
  result: KeywordResearchResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  /** Null on rows written before this column existed. Lets a failed run be
   *  retried under the same managed action instead of billing a second one –
   *  see startKeywordResearch. */
  actionId: string | null;
  /** When `actionId` was first minted – the instant the backend's replay
   *  window starts running, which is what a "free retry?" decision must be
   *  measured against. Distinct from `createdAt` as soon as a retry chain is
   *  two hops long: each retry is a fresh row with its own `createdAt` but the
   *  SAME action, so reading `createdAt` would restart the clock at every hop
   *  and keep offering a free replay long after the action really expired.
   *  Falls back to `createdAt` for rows predating the column. */
  actionStartedAt: string;
}

interface InFlightRun {
  runId: string;
  controller: AbortController;
  /** Resolves (never rejects) once the run has settled and been persisted. */
  promise: Promise<void>;
}

// One in-flight keyword-research run per appId.
const inFlight = new Map<string, InFlightRun>();

const nowIso = (): string => new Date().toISOString();

type WorkflowRunRow = typeof workflowRuns.$inferSelect;

function toView(row: WorkflowRunRow): WorkflowRunView {
  return {
    id: row.id,
    kind: row.kind,
    appId: row.appId,
    country: row.country,
    locale: row.locale,
    status: row.status as WorkflowRunView["status"],
    step: (row.step as WorkflowStepId | null) ?? null,
    progress: row.progress ? (JSON.parse(row.progress) as WorkflowProgress) : null,
    result: row.result ? (JSON.parse(row.result) as KeywordResearchResult) : null,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    actionId: row.actionId,
    actionStartedAt: row.actionStartedAt ?? row.createdAt,
  };
}

/** Drive one run to completion and persist every terminal outcome. Catches
 *  everything so the fire-and-forget promise can only resolve. */
async function driveRun(
  runId: string,
  input: KeywordResearchInput,
  signal: AbortSignal,
): Promise<void> {
  let lastProgressAt = 0;
  let lastStep: WorkflowStepId | null = null;

  const onProgress = (p: WorkflowProgress): void => {
    const now = Date.now();
    // A step transition always lands – only same-step spam is coalesced.
    if (p.step === lastStep && now - lastProgressAt < PROGRESS_THROTTLE_MS) return;
    lastStep = p.step;
    lastProgressAt = now;
    db.update(workflowRuns)
      .set({ step: p.step, progress: JSON.stringify(p), updatedAt: nowIso() })
      .where(eq(workflowRuns.id, runId))
      .run();
    emitWorkflowEvent({ runId, status: "running", step: p.step, progress: p });
  };

  try {
    const result = await runKeywordResearch(input, onProgress, signal);
    if (result.proposal === null) {
      // Cause-independent guard, checked once here regardless of *why* the
      // proposal is missing (a throttle case the workflow's own floor/
      // ceiling didn't catch, zero seeds generated, …): a "succeeded" run
      // must always carry a proposal. An empty success is worse than a
      // failure – it renders as an amber note over nothing, and listRuns
      // only lists succeeded runs, so it would pollute report history with
      // nothing to show.
      //
      // step: null rather than a hardcoded "compose" – runKeywordResearch
      // always runs every step through to "report" (its onProgress fires
      // unconditionally, win or lose), so the true last-reported step here
      // is "report", not "compose", regardless of cause. Neither name is
      // actually accurate: this isn't a step throwing, it's a boundary
      // policy decision made after the pipeline finished, so it doesn't
      // belong to any one step. The banner falls back to a step-less
      // message when step is null (see failedGeneric).
      db.update(workflowRuns)
        .set({
          status: "failed",
          step: null,
          error: "no_proposal",
          result: JSON.stringify(result),
          updatedAt: nowIso(),
        })
        .where(eq(workflowRuns.id, runId))
        .run();
      emitWorkflowEvent({ runId, status: "failed", step: "compose" });
      return;
    }
    db.update(workflowRuns)
      .set({ status: "succeeded", result: JSON.stringify(result), updatedAt: nowIso() })
      .where(eq(workflowRuns.id, runId))
      .run();
    emitWorkflowEvent({ runId, status: "succeeded" });
  } catch (err) {
    if (err instanceof WorkflowStepError) {
      // La vraie erreur (ex. rejet du proxy managé) est `err.cause` – `err.message`
      // n'est que "workflow_step_failed:<step>", jamais classifiable. La colonne
      // `error` ne garde que le code : sans cette trace, une cause non classifiée
      // (bug interne, rejet inattendu du proxy) n'était visible nulle part et le
      // run échouait en silence côté support.
      console.error(`[workflow] ${runId} failed at ${err.step}:`, err.cause);
      db.update(workflowRuns)
        .set({
          status: "failed",
          step: err.step,
          error: workflowErrorCode(err.cause, err.message),
          result: JSON.stringify(err.partial),
          updatedAt: nowIso(),
        })
        .where(eq(workflowRuns.id, runId))
        .run();
      emitWorkflowEvent({ runId, status: "failed", step: err.step });
      return;
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      // Cancellation carries no partial result – leave the prior result column.
      db.update(workflowRuns)
        .set({ status: "cancelled", updatedAt: nowIso() })
        .where(eq(workflowRuns.id, runId))
        .run();
      emitWorkflowEvent({ runId, status: "cancelled" });
      return;
    }
    // Defensive: the pipeline only throws WorkflowStepError / AbortError, but
    // never leave a row stuck on "running" if that contract is ever broken.
    const message = err instanceof Error ? err.message : "workflow_failed";
    db.update(workflowRuns)
      .set({ status: "failed", error: workflowErrorCode(err, message), updatedAt: nowIso() })
      .where(eq(workflowRuns.id, runId))
      .run();
    emitWorkflowEvent({ runId, status: "failed" });
  }
}

/** Earliest known start of `actionId` across the runs that share it, so a
 *  retry chain keeps measuring its replay window from the original mint rather
 *  than from its latest hop. Takes the minimum over every row (ISO-8601 sorts
 *  chronologically) instead of the oldest row's value alone: reports are
 *  deletable, and the chain's head row may well be gone. `fallback` is the
 *  answer when no row survives – the action is then effectively new to us.
 *  ponytail: full scan of a small local table, keyed lookup if it ever grows. */
function mintedAt(actionId: string, fallback: string): string {
  return db
    .select({ startedAt: workflowRuns.actionStartedAt, createdAt: workflowRuns.createdAt })
    .from(workflowRuns)
    .where(eq(workflowRuns.actionId, actionId))
    .all()
    .reduce((earliest, row) => {
      const started = row.startedAt ?? row.createdAt;
      return started < earliest ? started : earliest;
    }, fallback);
}

/**
 * Start a keyword-research run for an app. Returns the new runId, or
 * `{ error: "already_running" }` when a run for the same app is still
 * in flight. The pipeline runs fire-and-forget; poll via getRun/getLatestRun
 * or subscribe to workflowEvents for progress.
 *
 * `input.actionId` lets a retry reuse a previous (failed) run's action –
 * resolved here rather than inside runKeywordResearch so it can be persisted
 * on the row at creation, before the run even starts: that's what makes it
 * available for a *future* retry if this run fails too. Its original mint time
 * travels with it (see mintedAt), so the third hop of a retry chain still
 * knows when the backend's window actually opened.
 */
export async function startKeywordResearch(
  input: KeywordResearchInput,
): Promise<{ runId: string } | { error: "already_running" }> {
  if (inFlight.has(input.appId)) {
    return { error: "already_running" };
  }

  const actionId = input.actionId ?? crypto.randomUUID();
  const runId = ulid();
  const createdAt = nowIso();
  db.insert(workflowRuns)
    .values({
      id: runId,
      kind: "keyword-research",
      appId: input.appId,
      country: input.country,
      locale: input.locale,
      actionId,
      actionStartedAt: input.actionId ? mintedAt(input.actionId, createdAt) : createdAt,
      status: "running",
      createdAt,
      updatedAt: createdAt,
    })
    .run();
  emitWorkflowEvent({ runId, status: "running" });

  const controller = new AbortController();
  // Reserve the slot synchronously (no await before this) so a concurrent
  // start for the same app is refused.
  const promise = driveRun(runId, { ...input, actionId }, controller.signal).finally(() => {
    inFlight.delete(input.appId);
  });
  inFlight.set(input.appId, { runId, controller, promise });

  return { runId };
}

/** Abort an in-flight run. Returns false if the run is unknown or terminal. */
export function cancelRun(runId: string): boolean {
  for (const entry of inFlight.values()) {
    if (entry.runId === runId) {
      entry.controller.abort();
      return true;
    }
  }
  return false;
}

/** Mark runs left "running" by a dead process as failed. Call once at boot –
 *  a row can only legitimately be running if it is in the in-memory inFlight
 *  map, which a restart empties. Returns the number of rows repaired. */
export function failStuckRuns(): number {
  const live = new Set([...inFlight.values()].map((r) => r.runId));
  const rows = db.select().from(workflowRuns).where(eq(workflowRuns.status, "running")).all();
  let repaired = 0;
  for (const row of rows) {
    if (live.has(row.id)) continue;
    db.update(workflowRuns)
      .set({ status: "failed", error: "server_restarted", updatedAt: nowIso() })
      .where(eq(workflowRuns.id, row.id))
      .run();
    repaired++;
  }
  return repaired;
}

export function getRun(runId: string): WorkflowRunView | null {
  const row = db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).get();
  return row ? toView(row) : null;
}

export function getLatestRun(appId: string): WorkflowRunView | null {
  const row = db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.appId, appId))
    .orderBy(desc(workflowRuns.createdAt), desc(workflowRuns.id))
    .limit(1)
    .get();
  return row ? toView(row) : null;
}

/** Succeeded runs for an app filtered by storefront country + locale, newest
 *  first (capped at 20). Feeds the report-history list in the research dialog. */
export function listRuns(
  appId: string,
  filter: { country: string; locale: string },
): WorkflowRunView[] {
  return db
    .select()
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.appId, appId),
        eq(workflowRuns.status, "succeeded"),
        eq(workflowRuns.country, filter.country),
        eq(workflowRuns.locale, filter.locale),
      ),
    )
    .orderBy(desc(workflowRuns.createdAt), desc(workflowRuns.id))
    .limit(20)
    .all()
    .map(toView);
}

/** Delete one persisted run row. Returns whether a row existed. Used by the
 *  per-report delete button in the research history; in-flight runs are
 *  cancelled via cancelRun, not deleted here. */
export function deleteRun(runId: string): boolean {
  return db.delete(workflowRuns).where(eq(workflowRuns.id, runId)).run().changes > 0;
}

/** Delete every workflow run row (all apps). Returns the number removed.
 *  Backs the "delete all reports" settings action. */
export function deleteAllRuns(): number {
  return db.delete(workflowRuns).run().changes;
}

/** Test-only: resolves once the in-flight run for `runId` settles (or
 *  immediately if it already has), so tests can assert final persisted state
 *  without arbitrary sleeps. */
export function __whenSettled(runId: string): Promise<void> {
  for (const entry of inFlight.values()) {
    if (entry.runId === runId) return entry.promise;
  }
  return Promise.resolve();
}
