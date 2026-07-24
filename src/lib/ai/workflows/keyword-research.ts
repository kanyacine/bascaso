// Autonomous keyword-research pipeline. Eight sequential steps – three of
// them LLM seams routed through getLanguageModelForTask ("workflow-seeds",
// "workflow-relevance", "workflow-compose"). Relevance runs before the
// harvested candidates are scored, so irrelevant ones never cost a paced
// iTunes search. Every step reports progress and can be aborted between
// units of work; a non-abort throw is wrapped in a WorkflowStepError
// carrying the partial result gathered so far.

import type { ZodType } from "zod";
import { appleFmInputTooLarge } from "@/lib/ai/apple-fm";
import { searchApps } from "@/lib/aso/itunes";
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
  type ResearchStrategy,
} from "@/lib/ai/workflows/prompts";

export type { ResearchStrategy } from "@/lib/ai/workflows/prompts";

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
  candidates: RankedCandidate[]; // ranked, relevant first, opportunity desc
  proposal: MetadataProposal | null; // null when compose step didn't run
  opportunities: Array<{ keyword: string; signals: unknown[] }>; // deriveOpportunities output for top 10
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

export const MAX_CANDIDATES = 120; // ponytail: hard cap, log dropped count – raise if users hit it
const MAX_SEEDS = 25;

// Multiplicateurs par classification respectASO – validés en revue le
// 2026-07-24. Avoid reste pénalisé partout, jamais exclu.
export const STRATEGY_WEIGHTS: Record<ResearchStrategy, Record<ClassificationLabel, number>> = {
  balanced: { "Sweet Spot": 1.3, "Hidden Gem": 1.2, "Good Target": 1.1, "Moderate": 1.0, "Low Volume": 0.6, "High Competition": 0.4, "Avoid": 0.2 },
  broad: { "Sweet Spot": 1.5, "Hidden Gem": 0.8, "Good Target": 1.2, "Moderate": 1.0, "Low Volume": 0.3, "High Competition": 0.6, "Avoid": 0.2 },
  niche: { "Sweet Spot": 0.9, "Hidden Gem": 1.6, "Good Target": 1.0, "Moderate": 0.8, "Low Volume": 0.7, "High Competition": 0.2, "Avoid": 0.2 },
};

/** Strategy-weighted worth of a candidate – classification multiplier on top
 *  of the opportunity score. Unknown classifications (legacy rows) weigh 1. */
export function strategyValue(
  candidate: RankedCandidate,
  strategy: ResearchStrategy,
): number {
  const weight =
    STRATEGY_WEIGHTS[strategy][candidate.classification as ClassificationLabel] ?? 1;
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

export async function runKeywordResearch(
  input: KeywordResearchInput,
  onProgress: (p: WorkflowProgress) => void,
  signal: AbortSignal,
): Promise<KeywordResearchResult> {
  const partial: KeywordResearchResult = {
    candidates: [],
    proposal: null,
    opportunities: [],
  };
  const scoresByKeyword = new Map<string, KeywordScore>();
  const strategy = input.strategy ?? "balanced";

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
    const resolved = await getLanguageModelForTask("workflow-seeds");
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
      const score = await scoreKeyword(keyword, input.country, input.appAppleId ?? undefined);
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
    const resolved = await getLanguageModelForTask("workflow-relevance");
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
      const score = await scoreKeyword(candidate.keyword, input.country, input.appAppleId ?? undefined);
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
      onProgress({ step: "score", done: i + 1, total: toScore.length });
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
    const resolved = await getLanguageModelForTask("workflow-compose");
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
