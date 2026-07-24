// Autonomous keyword-research pipeline. Eight sequential steps – three of
// them LLM seams routed through getLanguageModelForTask ("workflow-seeds",
// "workflow-relevance", "workflow-compose"), the rest pure ASO helpers and
// the cache-first scoring service. Every step reports progress and can be
// aborted between units of work; a non-abort throw is wrapped in a
// WorkflowStepError carrying the partial result gathered so far.

import type { ZodType } from "zod";
import { searchApps } from "@/lib/aso/itunes";
import { scoreKeyword, type KeywordScore } from "@/lib/aso/score-service";
import {
  appendKeywordToField,
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

const RELEVANCE_BATCH = 30;
const COMPOSE_TOP = 30;
const REPORT_TOP = 10;
const MAX_METADATA_LENGTH = 30;
const MAX_KEYWORD_FIELD_LENGTH = 100;

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

/**
 * Greedily packs the highest-ranked keywords into an App Store Connect
 * keyword field (comma-separated, ≤100 chars), skipping any keyword whose
 * words already appear in the title/subtitle. Uses appendKeywordToField so
 * the field-level dedup and length rules stay in one place.
 */
export function buildKeywordField(
  ranked: RankedCandidate[],
  titleWords: Set<string>,
): string {
  let field = "";
  for (const candidate of ranked) {
    const words = tokenizeWords(candidate.keyword);
    if (words.some((w) => titleWords.has(w))) continue;
    const next = appendKeywordToField(field, candidate.keyword);
    if (next !== null) field = next;
  }
  return field;
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
  if (maxInputChars && built.system.length + built.prompt.length > maxInputChars) {
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

/** Order-preserving dedup of candidates by lowercased keyword. */
function dedupeCandidates(
  candidates: Array<{ keyword: string; source: "seed" | "harvested" }>,
): Array<{ keyword: string; source: "seed" | "harvested" }> {
  const seen = new Set<string>();
  const out: typeof candidates = [];
  for (const c of candidates) {
    const key = c.keyword.trim().toLowerCase();
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

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
    });
    const object = await callLlm(resolved, built);
    return object.seeds;
  });

  // 3. expand – harvest single-word candidates from competitor titles.
  const candidates = await step("expand", 1, async () => {
    const harvested = harvestCandidates(seeds, competitorTitles);
    const combined = dedupeCandidates([
      ...seeds.map((keyword) => ({ keyword, source: "seed" as const })),
      ...harvested.map((keyword) => ({ keyword, source: "harvested" as const })),
    ]);
    if (combined.length > MAX_CANDIDATES) {
      const dropped = combined.length - MAX_CANDIDATES;
      console.log(
        `[workflow] keyword-research dropping ${dropped} candidate(s) over cap ${MAX_CANDIDATES}`,
      );
      return combined.slice(0, MAX_CANDIDATES);
    }
    return combined;
  });

  // 4. score – cache-first scoring per candidate; abort-checked each iteration.
  await step("score", candidates.length, async () => {
    for (let i = 0; i < candidates.length; i++) {
      abortIfCancelled(signal);
      const candidate = candidates[i];
      const score = await scoreKeyword(
        candidate.keyword,
        input.country,
        input.appAppleId ?? undefined,
      );
      scoresByKeyword.set(candidate.keyword, score);
      partial.candidates.push({
        keyword: candidate.keyword,
        source: candidate.source,
        popularity: score.popularity,
        difficulty: score.difficulty,
        opportunity: score.opportunity,
        classification: score.classification,
        relevant: false,
      });
      onProgress({ step: "score", done: i + 1, total: candidates.length });
    }
  });

  // 5. relevance – LLM in batches of 30; unreturned keywords stay relevant:false.
  await step("relevance", partial.candidates.length, async () => {
    if (partial.candidates.length === 0) return;
    const resolved = await getLanguageModelForTask("workflow-relevance");
    const relevantSet = new Set<string>();
    for (let i = 0; i < partial.candidates.length; i += RELEVANCE_BATCH) {
      abortIfCancelled(signal);
      const batch = partial.candidates.slice(i, i + RELEVANCE_BATCH);
      const built = buildRelevancePrompt({
        appName: input.appName,
        subtitle: input.subtitle,
        description: input.description,
        keywords: batch.map((c) => c.keyword),
      });
      const object = await callLlm(resolved, built);
      for (const keyword of object.relevant) {
        relevantSet.add(keyword.trim().toLowerCase());
      }
      onProgress({
        step: "relevance",
        done: Math.min(i + RELEVANCE_BATCH, partial.candidates.length),
        total: partial.candidates.length,
      });
    }
    for (const candidate of partial.candidates) {
      if (relevantSet.has(candidate.keyword.trim().toLowerCase())) {
        candidate.relevant = true;
      }
    }
  });

  // 6. rank – relevant first, opportunity desc, popularity desc tiebreak.
  await step("rank", 1, async () => {
    partial.candidates.sort((a, b) => {
      if (a.relevant !== b.relevant) return a.relevant ? -1 : 1;
      if (b.opportunity !== a.opportunity) return b.opportunity - a.opportunity;
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
    let keywords = object.keywords;
    if (keywords.length > MAX_KEYWORD_FIELD_LENGTH) {
      const avoid = new Set([
        ...tokenizeWords(object.title),
        ...tokenizeWords(object.subtitle),
      ]);
      keywords = buildKeywordField(partial.candidates, avoid);
    }
    partial.proposal = {
      title: capMetadataField(object.title, MAX_METADATA_LENGTH),
      subtitle: capMetadataField(object.subtitle, MAX_METADATA_LENGTH),
      keywords,
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
