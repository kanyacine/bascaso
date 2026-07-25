// Autonomous keyword-research pipeline. Eight sequential steps – three of
// them LLM seams routed through getLanguageModelForTask ("workflow-seeds",
// "workflow-relevance", "workflow-compose"). Relevance runs before the
// harvested candidates are scored, so irrelevant ones never cost a paced
// iTunes search. Every step reports progress and can be aborted between
// units of work; a non-abort throw is wrapped in a WorkflowStepError
// carrying the partial result gathered so far.
//
// The managed credit is spent on the first LLM call ("seeds"), before any
// per-keyword iTunes scoring runs – so a scoring call that fails from then on
// is spending an already-paid-for run. A persistently-throttled iTunes call
// (ItunesRateLimited / SearchApiUnavailableError – see itunes.ts) is treated
// as a missing data point for that one keyword rather than aborting the run:
// it is skipped and recorded in `skippedKeywords`, and the run keeps going
// with whatever did score. Any other error still aborts (WorkflowStepError) –
// only the iTunes-specific failure modes degrade.
//
// Four guards keep "degrade" from becoming its own failure mode:
// - CONSECUTIVE_ITUNES_FAILURE_LIMIT trips a circuit breaker after N
//   straight iTunes failures: the remaining keywords are skipped without
//   even attempting them, so a fully-throttled run costs a handful of failed
//   calls instead of paying the full retry/backoff ladder for every
//   remaining keyword (tens of minutes – risking a second debit past the
//   90-minute per-action window). A run-level wall-clock budget
//   (MAX_RUN_DURATION_MS) backs this up: scoreKeyword is cache-first, so an
//   interleaved run (cache hit, throttled miss, cache hit, …) keeps
//   resetting the consecutive-failure counter without the breaker ever
//   tripping – the budget bounds duration even then.
// - MIN_SCORED_FRACTION: below this fraction of *attempted* keywords
//   actually scored, the surviving sample is too thin to build a proposal a
//   user should one-click-apply – the run fails instead of succeeding on a
//   token sample. "Attempted" excludes keywords the breaker/budget skipped
//   without ever calling scoreKeyword – counting those against the fraction
//   would punish the breaker for doing its job (the more work it saves, the
//   worse the fraction looks) instead of measuring how representative the
//   real sample is.
// - MIN_SCORED_KEYWORDS: the ratio above is not enough on its own, because
//   the breaker caps how large its denominator can ever get – a sustained
//   outage pins attemptedItunesFailures at CONSECUTIVE_ITUNES_FAILURE_LIMIT,
//   so the ratio alone can only fail a run with 0 or 1 scored keyword. An
//   absolute floor catches the 2-keyword case the ratio structurally cannot.
// - Zero scored candidates always fails loudly, the way the whole run used
//   to before this file existed – degrading must mean "some data missing",
//   never "no data, silently reported as done". (Subsumed by
//   MIN_SCORED_KEYWORDS above, kept as its own bullet because it's the
//   guard's original, easiest-to-reason-about case.)

import type { ZodType } from "zod";
import { appleFmInputTooLarge } from "@/lib/ai/apple-fm";
import { ItunesRateLimited, SearchApiUnavailableError, searchApps } from "@/lib/aso/itunes";
import { scoreKeyword, type KeywordScore } from "@/lib/aso/score-service";
import type { ClassificationLabel } from "@/lib/aso/scoring";
import {
  ASC_FIELD_MAX_LENGTH,
  deriveInsights,
  deriveOpportunities,
} from "@/lib/aso/research";
import { generateObjectWithRepair } from "@/lib/ai/structured-output";
import { getLanguageModelForTask } from "@/lib/ai/provider-factory";
import { noThinkingOptions, samplingTemperature } from "@/lib/ai/provider-options";
import {
  buildComposePrompt,
  buildRelevancePrompt,
  buildSeedsPrompt,
} from "@/lib/ai/workflows/prompts";
import {
  DEFAULT_STRATEGY,
  STRATEGIES,
  type ResearchStrategy,
} from "@/lib/ai/workflows/strategies";

export type { ResearchStrategy } from "@/lib/ai/workflows/strategies";

export interface KeywordResearchInput {
  appId: string;
  appAppleId: number | null;
  appName: string;
  country: string; // storefront, lowercase alpha-2
  locale: string; // target language for seeds/proposal
  title?: string;
  subtitle?: string;
  description?: string; // truncated to 1500 chars before prompting
  currentKeywords?: string;
  strategy?: ResearchStrategy; // défaut "balanced"
  /** Reuse a previous run's action id (retry) instead of minting a fresh one –
   *  see run-manager.ts's startKeywordResearch. Replaying the same actionId
   *  is free within the backend's per-action window; omitted for a first
   *  attempt. */
  actionId?: string;
}

export type WorkflowStepId =
  | "context"
  | "seeds"
  | "expand"
  | "score"
  | "relevance"
  | "rank"
  | "compose"
  | "report";

export interface WorkflowProgress {
  step: WorkflowStepId;
  done: number;
  total: number;
}

export interface RankedCandidate {
  keyword: string;
  source: "seed" | "harvested";
  popularity: number | null;
  difficulty: number;
  opportunity: number;
  classification: string;
  relevant: boolean;
}

export interface MetadataProposal {
  title: string;
  subtitle: string;
  keywords: string;
  summary: string;
}

export interface KeywordResearchResult {
  candidates: RankedCandidate[]; // ranked, relevant first, strategy value desc
  proposal: MetadataProposal | null; // null when compose step didn't run
  opportunities: Array<{ keyword: string; signals: unknown[] }>; // deriveOpportunities output for top 10
  strategy: ResearchStrategy; // the strategy this run was configured with
  /** Keywords dropped mid-run because iTunes stayed throttled after retries –
   *  the run still completed with the remaining candidates. Empty on a clean
   *  run; a non-empty list means the result is honest but partial. */
  skippedKeywords: string[];
}

export class WorkflowStepError extends Error {
  constructor(
    public step: WorkflowStepId,
    public partial: KeywordResearchResult,
    cause: unknown,
  ) {
    super(`workflow_step_failed:${step}`);
    this.cause = cause;
  }
}

/** Thrown (as a WorkflowStepError's cause, step "score") when the floor or
 *  ceiling guard rejects a run's iTunes data as unusable – see the file
 *  header. A distinct class (rather than a plain Error) lets run-manager.ts
 *  recognize it and store a stable, translatable `workflow_runs.error` code
 *  instead of the generic `workflow_step_failed:score`. */
export class ItunesUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItunesUnavailableError";
  }
}

export const MAX_CANDIDATES = 120; // ponytail: hard cap, log dropped count – raise if users hit it
const MAX_SEEDS = 25;

/** Strategy-weighted worth of a candidate – classification multiplier on top
 *  of the opportunity score. Unknown classifications (legacy rows) weigh 1. */
export function strategyValue(
  candidate: RankedCandidate,
  strategy: ResearchStrategy,
): number {
  const weight =
    STRATEGIES[strategy].weights[candidate.classification as ClassificationLabel] ?? 1;
  return candidate.opportunity * weight;
}

const RELEVANCE_BATCH = 30;
const COMPOSE_TOP = 30;
const REPORT_TOP = 10;
const MAX_METADATA_LENGTH = 30;

// ── Pure helpers (exported for tests) ────────────────────────────────────

/** Lowercased word tokens (letters/numbers), Unicode-aware so accented
 *  characters in non-English storefronts survive tokenization. */
function tokenizeWords(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Mines single-word keyword candidates from competitor titles: tokenizes
 * each title, lowercases, drops words shorter than 3 chars, dedupes among
 * themselves and against the seed phrases already in play.
 */
export function harvestCandidates(
  seeds: string[],
  competitorTitles: string[],
): string[] {
  const seedSet = new Set(seeds.map((s) => s.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const title of competitorTitles) {
    for (const token of tokenizeWords(title)) {
      if (token.length < 3) continue;
      if (seedSet.has(token)) continue;
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

/**
 * Deterministically caps a metadata field (title/subtitle) to `limit` chars,
 * preferring the last word boundary within the limit and falling back to a hard
 * slice, then trimming trailing whitespace. Guarantees the proposal never
 * exceeds the ASC field limit even when the LLM ignores the retry hint – the
 * same guarantee buildKeywordField gives the keyword field.
 */
export function capMetadataField(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const hard = text.slice(0, limit);
  const lastSpace = hard.lastIndexOf(" ");
  const cut = lastSpace > 0 ? hard.slice(0, lastSpace) : hard;
  return cut.trimEnd();
}

export const APPLE_IGNORED_WORDS = new Set([
  // Words Apple provably drops from its index (ASC guidance + RadASO
  // ranking experiments) – they cost characters and complete no query.
  // Short function words proven to matter ("to", "do", "my", "me",
  // "your") are deliberately NOT listed.
  "a", "an", "the", "and", "or", "for", "of", "with",
  "app", "apps", "free", "iphone", "ipad",
]);

interface FieldPhrase {
  value: number;
  words: string[]; // unique, Apple-ignored and title words stripped
}

/**
 * Packs the ≤100-char keyword field by budgeted phrase coverage. A word only
 * earns its characters by completing a valuable candidate phrase: words
 * already in the title/subtitle (or already selected) cost nothing, words
 * Apple ignores are never packed. Selection greedily takes the phrase with
 * the best value per missing character until nothing affordable remains,
 * then tops the field up word-by-word from the best remaining phrases. The
 * output keeps phrase-value order – earlier keywords weigh more in Apple's
 * index.
 */
export function buildKeywordField(
  ranked: RankedCandidate[],
  titleWords: Set<string>,
  valueOf: (c: RankedCandidate) => number = (c) => c.opportunity,
): string {
  const phrases: FieldPhrase[] = ranked
    .map((c) => ({
      value: valueOf(c),
      words: [...new Set(tokenizeWords(c.keyword))].filter(
        (w) => !APPLE_IGNORED_WORDS.has(w) && !titleWords.has(w),
      ),
    }))
    .filter((p) => p.value > 0 && p.words.length > 0)
    .sort((a, b) => b.value - a.value);

  const selected = new Set<string>();
  let used = 0; // field chars, separating commas included
  const costOf = (words: string[]): number =>
    words.reduce((sum, w) => sum + w.length + 1, 0) - (selected.size === 0 ? 1 : 0);

  // Phase 1 – whole phrases by value per missing character.
  for (;;) {
    let best: { missing: string[]; ratio: number } | null = null;
    for (const p of phrases) {
      const missing = p.words.filter((w) => !selected.has(w));
      if (missing.length === 0) continue;
      const cost = costOf(missing);
      if (used + cost > ASC_FIELD_MAX_LENGTH) continue;
      const ratio = p.value / cost;
      if (!best || ratio > best.ratio) best = { missing, ratio };
    }
    if (!best) break;
    used += costOf(best.missing);
    for (const w of best.missing) selected.add(w);
  }

  // Phase 2 – top up word-by-word, so a phrase too big to fit whole still
  // contributes its head words toward combinations with the rest.
  for (const p of phrases) {
    for (const w of p.words) {
      if (selected.has(w)) continue;
      const cost = w.length + (selected.size === 0 ? 0 : 1);
      if (used + cost > ASC_FIELD_MAX_LENGTH) continue;
      selected.add(w);
      used += cost;
    }
  }

  // Emit in phrase-value order.
  const out: string[] = [];
  for (const p of phrases) {
    for (const w of p.words) {
      if (selected.has(w) && !out.includes(w)) out.push(w);
    }
  }
  return out.join(",");
}

// ── Orchestrator ─────────────────────────────────────────────────────────

type ResolvedModel = Awaited<ReturnType<typeof getLanguageModelForTask>>;

/** Run one LLM seam: guard the input against the model's char budget, then
 *  generate structured output with the shared no-thinking/temperature-0
 *  settings. The tiny on-device Apple model rejects oversized steps. */
async function callLlm<T extends Record<string, unknown>>(
  resolved: ResolvedModel,
  built: { system: string; prompt: string; schema: ZodType<T> },
): Promise<T> {
  const { model, providerId, modelId, maxInputChars } = resolved;
  // maxInputChars doubles as the is-apple-fm marker; the real budget is the
  // script-aware token estimate – 12k chars of CJK is ~4× the 3k-token window.
  if (maxInputChars !== undefined && appleFmInputTooLarge(built.system + built.prompt)) {
    throw new Error("workflow_input_too_large");
  }
  const { object } = await generateObjectWithRepair({
    model,
    schema: built.schema,
    system: built.system,
    prompt: built.prompt,
    temperature: samplingTemperature(providerId, modelId, 0),
    providerId,
    providerOptions: noThinkingOptions(providerId, modelId),
  });
  return object;
}

const abortIfCancelled = (signal: AbortSignal): void => {
  if (signal.aborted) throw new DOMException("aborted", "AbortError");
};

/** True for the two iTunes-side failure modes that mean "this keyword didn't
 *  score" rather than a real bug – see itunes.ts. Any other error (a DB
 *  write failure, a programming error…) still aborts the step. */
function isItunesUnavailable(
  err: unknown,
): err is ItunesRateLimited | SearchApiUnavailableError {
  return err instanceof ItunesRateLimited || err instanceof SearchApiUnavailableError;
}

// After this many *consecutive, actually-attempted* iTunes failures, stop
// attempting further keywords for the rest of the run – see the file header.
// 3 is deliberately small: on the fast path (iTunes Search API rate-limits,
// itunesSearch's own 2 attempts ≤5 s apart, plus the adaptive backoff before
// the next call – grows ×1.6 per failure, 3 s → 4.8 s → 7.68 s…), 3 in a row
// is ≈30 s worst case. On the rarer SSR fallback path (reached only when
// iTunes returns a non-rate-limit error, not a 429/503) a single failure is
// slower – itunesSearch's 2 attempts at up to 15 s each, then fetchSsrPage's
// 3 attempts at up to 30 s each plus backoff, ≈2 min worst case – so 3 in a
// row there is on the order of 6–7 min. Either way this is minutes, not the
// tens of minutes the breaker exists to avoid, and comfortably inside the
// 90-minute per-action window. "Actually-attempted" matters: a keyword the
// breaker or MAX_RUN_DURATION_MS skips without calling scoreKeyword must
// never count toward this – see recordItunesFailure.
const CONSECUTIVE_ITUNES_FAILURE_LIMIT = 3;

// Backstop for CONSECUTIVE_ITUNES_FAILURE_LIMIT: scoreKeyword is cache-first,
// so a run that interleaves cache hits with throttled misses (e.g. a second
// research run for the same app – the dialog auto-dumps every candidate into
// the shared score cache, so this is the common case, not an edge case) can
// see a cache-hit success reset the consecutive-failure counter before it
// ever reaches the limit, even though the cache hit says nothing about
// whether iTunes itself has recovered. Duration is the quantity actually
// being protected, so bound it directly: once a run has spent this long
// since it started, stop attempting further keywords the same way the
// breaker does. 60 min leaves a 30-min margin under the 90-minute
// per-action window for the LLM steps (seeds/relevance/compose) that still
// need to run afterwards.
const MAX_RUN_DURATION_MS = 60 * 60 * 1000;

// Below this fraction of attempted keywords actually scored, the run fails
// instead of succeeding – see the file header. 0.3 is chosen so the
// pathological case the breaker exists to prevent (a couple of early
// successes, then throttling for the rest – e.g. 1 scored out of 8 attempted,
// 12.5 %) still fails loudly, while a run where sustained throttling only
// hit after a broad, representative sample was already gathered (e.g. 20 of
// 30 planned keywords) still delivers a proposal worth the spent credit.
//
// This ratio alone is not enough: the breaker caps attemptedItunesFailures at
// CONSECUTIVE_ITUNES_FAILURE_LIMIT (3), so in a sustained outage the
// denominator is pinned at `scored + 3` – solving scored/(scored+3) < 0.3
// gives scored < 9/7, i.e. the ratio can only fail a run with 0 or 1 scored
// keyword. An outage that starts after 2 successes (2/(2+3) = 40 %) would
// sail through with a two-keyword proposal. MIN_SCORED_KEYWORDS below is an
// absolute floor alongside the ratio for exactly this case – it doesn't
// re-punish the breaker for saving work (it's a floor, not a fraction of
// planned-but-abandoned keywords), it just refuses to trust a handful of
// data points regardless of how good their ratio looks. 5 is chosen to kill
// 1–2-keyword proposals outright while still passing the breaker's own
// confirmed-good case (7 scored, 3 attempted failures, a realistic ~130-
// candidate harvest – see the "realistic harvest size" test): the LLM
// compose step gets a genuinely small candidate pool, not a token sample.
const MIN_SCORED_FRACTION = 0.3;
const MIN_SCORED_KEYWORDS = 5;

/**
 * Pure floor+ceiling decision, isolated from the orchestrator so the boundary
 * math is testable without engineering exact mock call sequences. `scored`
 * and `skipped` are counts of *attempted* keywords only (candidates that were
 * never attempted at all – e.g. filtered out as irrelevant, or skipped by the
 * breaker/budget without a call – don't belong in either number). Two
 * independent guards: an absolute floor (too few real data points, full
 * stop, regardless of how favourable the ratio looks) and a ratio ceiling
 * (a large-enough sample that's still disproportionately full of failures).
 */
export function shouldFailForThinSample(scored: number, skipped: number): boolean {
  if (skipped === 0) return false; // clean run – iTunes never caused a skip
  if (scored < MIN_SCORED_KEYWORDS) return true; // absolute floor
  return scored / (scored + skipped) < MIN_SCORED_FRACTION; // ratio ceiling
}

export async function runKeywordResearch(
  input: KeywordResearchInput,
  onProgress: (p: WorkflowProgress) => void,
  signal: AbortSignal,
): Promise<KeywordResearchResult> {
  const strategy = input.strategy ?? DEFAULT_STRATEGY;
  // 1 run de workflow = 1 action managée (1 jeton), quels que soient ses appels LLM.
  // Un retry fourni par l'appelant réutilise le même actionId (fenêtre de
  // rejeu gratuite côté backend) plutôt que d'en frapper un nouveau.
  const actionId = input.actionId ?? crypto.randomUUID();
  const runStartedAt = Date.now();
  const partial: KeywordResearchResult = {
    candidates: [],
    proposal: null,
    opportunities: [],
    strategy,
    skippedKeywords: [],
  };
  const scoresByKeyword = new Map<string, KeywordScore>();

  // Circuit breaker shared across the "expand" and "score" loops (both score
  // keywords via iTunes) – see CONSECUTIVE_ITUNES_FAILURE_LIMIT above. Once
  // tripped it stays open for the rest of this run: there is no cool-down
  // retry, since the whole point is bounding a fully-throttled run's
  // duration, not eventually recovering within it.
  let consecutiveItunesFailures = 0;
  let itunesCircuitOpen = false;
  // Keywords actually attempted (scoreKeyword was called) that failed –
  // distinct from partial.skippedKeywords, which also holds keywords the
  // breaker/budget skipped without ever attempting them. Only this count
  // feeds shouldFailForThinSample; see the file header and that function's
  // doc comment for why conflating the two is wrong.
  let attemptedItunesFailures = 0;

  /** Trips the breaker once the run has been going for too long – see
   *  MAX_RUN_DURATION_MS. A cache hit resets consecutiveItunesFailures
   *  without this ever having attempted a real iTunes call, so it cannot be
   *  caught by the consecutive-failure count alone. */
  function tripBreakerIfOverBudget(): void {
    if (itunesCircuitOpen || Date.now() - runStartedAt <= MAX_RUN_DURATION_MS) return;
    itunesCircuitOpen = true;
    console.warn(
      `[workflow] keyword-research: run exceeded its ${MAX_RUN_DURATION_MS / 60_000} min wall-clock budget – ` +
        "skipping the rest of this run's keywords without further attempts",
    );
  }

  /** Records one *attempted* keyword that failed against iTunes: skip it,
   *  count it toward both the breaker and the attempted-failure tally, and
   *  log. Trips the breaker at the limit so the caller's loop stops
   *  attempting further keywords. */
  function recordItunesFailure(keyword: string, err: ItunesRateLimited | SearchApiUnavailableError): void {
    partial.skippedKeywords.push(keyword);
    attemptedItunesFailures++;
    consecutiveItunesFailures++;
    if (!itunesCircuitOpen && consecutiveItunesFailures >= CONSECUTIVE_ITUNES_FAILURE_LIMIT) {
      itunesCircuitOpen = true;
      console.warn(
        `[workflow] keyword-research: iTunes unavailable ${CONSECUTIVE_ITUNES_FAILURE_LIMIT} times in a row – ` +
          "skipping the rest of this run's keywords without further attempts",
      );
      return;
    }
    console.warn(
      `[workflow] keyword-research: iTunes still unavailable for "${keyword}" – skipping (${err.message})`,
    );
  }

  const step = async <T>(
    id: WorkflowStepId,
    total: number,
    fn: () => Promise<T>,
  ): Promise<T> => {
    onProgress({ step: id, done: 0, total });
    try {
      return await fn();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new WorkflowStepError(id, partial, err);
    }
  };

  // 1. context – own-name search gives competitor titles for the seed prompt.
  const context = await step("context", 1, () =>
    searchApps(input.appName, input.country, 10),
  );
  const competitorTitles = context
    .map((app) => app.trackName)
    .filter((t): t is string => typeof t === "string" && t.trim() !== "");

  // 2. seeds – LLM.
  const seeds = await step("seeds", 1, async () => {
    abortIfCancelled(signal);
    const resolved = await getLanguageModelForTask("workflow-seeds", { actionId });
    const built = buildSeedsPrompt({
      appName: input.appName,
      country: input.country,
      locale: input.locale,
      title: input.title,
      subtitle: input.subtitle,
      description: input.description,
      currentKeywords: input.currentKeywords,
      competitorTitles,
      strategy,
    });
    const object = await callLlm(resolved, built);
    const unique = [...new Set(object.seeds.map((s) => s.trim().toLowerCase()))]
      .filter((s) => s !== "");
    return unique.slice(0, MAX_SEEDS);
  });

  // 3. expand – score the seeds (cache-first) and harvest single-word
  // candidates from the competitor titles those searches returned: real
  // category competitors, zero extra API calls vs scoring alone. The
  // own-name titles from the context step stay in as a secondary source.
  const candidates = await step("expand", seeds.length, async () => {
    const snapshotTitles: string[] = [];
    for (let i = 0; i < seeds.length; i++) {
      abortIfCancelled(signal);
      const keyword = seeds[i];
      tripBreakerIfOverBudget();
      if (itunesCircuitOpen) {
        // Le disjoncteur est déjà ouvert – ne pas retenter, juste marquer
        // manquant sans payer l'échelle de backoff.
        partial.skippedKeywords.push(keyword);
        onProgress({ step: "expand", done: i + 1, total: seeds.length });
        continue;
      }
      try {
        const score = await scoreKeyword(keyword, input.country, input.appAppleId ?? undefined);
        consecutiveItunesFailures = 0;
        scoresByKeyword.set(keyword, score);
        partial.candidates.push({
          keyword,
          source: "seed",
          popularity: score.popularity,
          difficulty: score.difficulty,
          opportunity: score.opportunity,
          classification: score.classification,
          relevant: false,
        });
        for (const app of score.competitors ?? []) {
          if (typeof app.trackName === "string" && app.trackName.trim() !== "") {
            snapshotTitles.push(app.trackName);
          }
        }
      } catch (err) {
        if (!isItunesUnavailable(err)) throw err;
        // Le crédit géré est déjà dépensé (premier appel LLM à l'étape "seeds") –
        // une seed non scorable devient un point de donnée manquant, pas un run
        // avorté.
        recordItunesFailure(keyword, err);
      }
      onProgress({ step: "expand", done: i + 1, total: seeds.length });
    }
    const harvested = harvestCandidates(seeds, [...snapshotTitles, ...competitorTitles]);
    const cap = Math.max(0, MAX_CANDIDATES - seeds.length);
    if (harvested.length > cap) {
      console.log(
        `[workflow] keyword-research dropping ${harvested.length - cap} candidate(s) over cap ${MAX_CANDIDATES}`,
      );
    }
    return harvested.slice(0, cap).map((keyword) => ({ keyword, source: "harvested" as const }));
  });

  // 4. relevance – LLM filter (indices, batches of 30) over seeds and
  // harvested alike, before any harvested keyword costs a paced iTunes
  // search. Unreturned keywords stay irrelevant.
  const toJudge = [
    ...partial.candidates.map((c) => c.keyword),
    ...candidates.map((c) => c.keyword),
  ];
  const relevantSet = await step("relevance", toJudge.length, async () => {
    const relevant = new Set<string>();
    if (toJudge.length === 0) return relevant;
    const resolved = await getLanguageModelForTask("workflow-relevance", { actionId });
    for (let i = 0; i < toJudge.length; i += RELEVANCE_BATCH) {
      abortIfCancelled(signal);
      const batch = toJudge.slice(i, i + RELEVANCE_BATCH);
      const built = buildRelevancePrompt({
        appName: input.appName,
        subtitle: input.subtitle,
        description: input.description,
        keywords: batch,
      });
      const object = await callLlm(resolved, built);
      if (object.relevant.length === 0) {
        console.warn("[workflow] relevance batch returned no indices – model output may be malformed");
      }
      for (const idx of object.relevant) {
        const keyword = batch[idx];
        if (keyword !== undefined) relevant.add(keyword.trim().toLowerCase());
      }
      onProgress({
        step: "relevance",
        done: Math.min(i + RELEVANCE_BATCH, toJudge.length),
        total: toJudge.length,
      });
    }
    return relevant;
  });
  for (const candidate of partial.candidates) {
    if (relevantSet.has(candidate.keyword.trim().toLowerCase())) candidate.relevant = true;
  }

  // 5. score – iTunes search for the relevant harvested candidates only;
  // the irrelevant ones are dropped before they cost a paced search.
  const toScore = candidates.filter((c) => relevantSet.has(c.keyword.trim().toLowerCase()));
  if (toScore.length < candidates.length) {
    console.log(
      `[workflow] keyword-research skipping ${candidates.length - toScore.length} irrelevant harvested candidate(s)`,
    );
  }
  await step("score", toScore.length, async () => {
    for (let i = 0; i < toScore.length; i++) {
      abortIfCancelled(signal);
      const candidate = toScore[i];
      tripBreakerIfOverBudget();
      if (itunesCircuitOpen) {
        partial.skippedKeywords.push(candidate.keyword);
        onProgress({ step: "score", done: i + 1, total: toScore.length });
        continue;
      }
      try {
        const score = await scoreKeyword(candidate.keyword, input.country, input.appAppleId ?? undefined);
        consecutiveItunesFailures = 0;
        scoresByKeyword.set(candidate.keyword, score);
        partial.candidates.push({
          keyword: candidate.keyword,
          source: candidate.source,
          popularity: score.popularity,
          difficulty: score.difficulty,
          opportunity: score.opportunity,
          classification: score.classification,
          relevant: true,
        });
      } catch (err) {
        if (!isItunesUnavailable(err)) throw err;
        recordItunesFailure(candidate.keyword, err);
      }
      onProgress({ step: "score", done: i + 1, total: toScore.length });
    }

    // Floor + ceiling – only fires when iTunes actually caused attempted
    // failures (a clean run, or one with an unrelated 0-candidate result e.g.
    // no seeds generated, is untouched: this is scoped to the throttle
    // failure mode). Deliberately counts attemptedItunesFailures, NOT
    // partial.skippedKeywords.length – the latter also holds keywords the
    // breaker/budget skipped without ever attempting them, and counting
    // those here would mean the more work the breaker saves, the more
    // likely this fails a run that actually had a perfectly good sample.
    if (shouldFailForThinSample(partial.candidates.length, attemptedItunesFailures)) {
      const attempted = partial.candidates.length + attemptedItunesFailures;
      throw new ItunesUnavailableError(
        partial.candidates.length < MIN_SCORED_KEYWORDS
          ? `itunes_unavailable: only ${partial.candidates.length} keyword(s) scored (of ${attempted} attempted) ` +
            `– below the ${MIN_SCORED_KEYWORDS}-keyword floor, too few to propose metadata from`
          : `itunes_unavailable: only ${partial.candidates.length}/${attempted} attempted keyword(s) could be ` +
            `scored (< ${Math.round(MIN_SCORED_FRACTION * 100)}%) – too thin a sample to propose metadata from`,
      );
    }
  });

  // 6. rank – relevant first, strategy value desc, popularity tiebreak.
  await step("rank", 1, async () => {
    partial.candidates.sort((a, b) => {
      if (a.relevant !== b.relevant) return a.relevant ? -1 : 1;
      const av = strategyValue(a, strategy);
      const bv = strategyValue(b, strategy);
      if (bv !== av) return bv - av;
      return (b.popularity ?? -1) - (a.popularity ?? -1);
    });
  });

  // 7. compose – LLM proposal on the top 30; enforce ASC field limits.
  await step("compose", 1, async () => {
    const top = partial.candidates.slice(0, COMPOSE_TOP);
    if (top.length === 0) return;
    abortIfCancelled(signal);
    const resolved = await getLanguageModelForTask("workflow-compose", { actionId });
    const built = buildComposePrompt({
      appName: input.appName,
      locale: input.locale,
      title: input.title,
      subtitle: input.subtitle,
      topKeywords: top.map((c) => ({
        keyword: c.keyword,
        popularity: c.popularity,
        difficulty: c.difficulty,
        opportunity: c.opportunity,
      })),
    });
    let object = await callLlm(resolved, built);
    if (
      object.title.length > MAX_METADATA_LENGTH ||
      object.subtitle.length > MAX_METADATA_LENGTH
    ) {
      abortIfCancelled(signal);
      object = await callLlm(resolved, {
        ...built,
        prompt: `${built.prompt}\nThe previous title/subtitle was too long – shorten it.`,
      });
    }
    // The keyword field is never the LLM's job – it cannot count characters.
    // Pack it from the relevant candidates, excluding words the capped
    // title/subtitle already cover.
    const title = capMetadataField(object.title, MAX_METADATA_LENGTH);
    const subtitle = capMetadataField(object.subtitle, MAX_METADATA_LENGTH);
    const avoid = new Set([...tokenizeWords(title), ...tokenizeWords(subtitle)]);
    partial.proposal = {
      title,
      subtitle,
      keywords: buildKeywordField(
        partial.candidates.filter((c) => c.relevant),
        avoid,
        (c) => strategyValue(c, strategy),
      ),
      summary: object.summary,
    };
  });

  // 8. report – opportunity/insight signals for the top 10 scored candidates.
  await step("report", REPORT_TOP, async () => {
    const top = partial.candidates.slice(0, REPORT_TOP);
    for (const candidate of top) {
      abortIfCancelled(signal);
      const score = scoresByKeyword.get(candidate.keyword);
      if (!score || !score.details) continue; // legacy/missing row → no signals
      const competitors = score.competitors ?? [];
      const signals = [
        ...deriveOpportunities(score.details, competitors),
        ...deriveInsights(score.details, competitors),
      ];
      partial.opportunities.push({ keyword: candidate.keyword, signals });
    }
  });

  return partial;
}
