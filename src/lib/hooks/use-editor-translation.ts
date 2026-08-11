"use client";

import { useCallback, useRef, useState } from "react";
import { notifyManagedDebit } from "@/lib/ai/debit-toast";
import { toastAIError } from "@/lib/ai/ai-error-toast";
import { useTranslations } from "@/lib/i18n/locale-context";
import { MAX_BATCH_CHARS, MAX_BATCH_ITEMS } from "@/lib/ai/tasks";
import type { TranslatableItem, TranslationEntry } from "@/lib/screenshot-editor/languages";

interface PayloadItem {
  id: string;
  kind: TranslatableItem["kind"];
  text: string;
}

/**
 * Split one language's payload into calls `/api/ai` will accept: it enforces both
 * `MAX_BATCH_ITEMS` and `MAX_BATCH_CHARS`, and a 10-screenshot doc clears 60 items on
 * headlines, subheadlines and text elements alone – unchunked, every language 400s.
 *
 * Ids stay the caller's global offsets, so a chunked result maps back the same way.
 * A single item over the char cap goes out alone and the route rejects that one call:
 * a 4 000-character headline is not a case worth splitting mid-sentence for.
 */
export function chunkBatchItems(items: PayloadItem[]): PayloadItem[][] {
  const chunks: PayloadItem[][] = [];
  let current: PayloadItem[] = [];
  let chars = 0;
  for (const item of items) {
    const full = current.length === MAX_BATCH_ITEMS || chars + item.text.length > MAX_BATCH_CHARS;
    if (current.length > 0 && full) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += item.text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export interface TranslationRun {
  entries: TranslationEntry[];
  /** First failure of the run, if any. The other languages still ran. */
  firstError?: string;
  /** Tier of the first successful call – the caller needs it to show the debit toast. */
  tier?: string;
}

interface TranslationBatchOptions {
  items: TranslatableItem[];
  sourceLanguage: string;
  targetLanguages: string[];
  appName?: string;
  /** One gesture = one id, shared by every call below = one managed credit (route.ts). */
  actionId: string;
  signal?: AbortSignal;
  onProgress?: (done: number) => void;
}

/**
 * One `/api/ai` call per target language, each carrying every item of the gesture – split
 * into as few calls as the route's batch caps allow when the doc is large.
 *
 * It used to be one call per (item × language): a 40-item set into 38 locales was 1 520
 * calls on a single action id, over the managed backend's per-action call cap and slow
 * enough to hit its time window too. The unit is now the language, so the call count of a
 * gesture is the number of languages the user asked for, times the chunk count.
 *
 * Exported (and pure) so the batching can be tested without React: the hook below is
 * bookkeeping around it.
 *
 * Returns null when the caller aborted – nothing to apply, nothing to report.
 */
export async function runTranslationBatches({
  items, sourceLanguage, targetLanguages, appName, actionId, signal, onProgress,
}: TranslationBatchOptions): Promise<TranslationRun | null> {
  const entries: TranslationEntry[] = [];
  let firstError: string | undefined;
  let tier: string | undefined;
  let done = 0;

  // Positional ids: the model only has to echo them back, and they cost fewer tokens than
  // anything descriptive. The item they map to is this array's entry at the same offset.
  const chunks = chunkBatchItems(items.map((item, index) => ({
    id: String(index), kind: item.kind, text: item.text,
  })));

  for (const target of targetLanguages) {
    if (signal?.aborted) return null;
    for (const chunk of chunks) {
      if (signal?.aborted) return null;
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "translate", actionId, text: "", items: chunk,
            fromLocale: sourceLanguage, toLocale: target, appName,
          }),
          signal,
        });
        const data = await res.json();
        if (!res.ok) {
          firstError = firstError ?? data.error;
        } else {
          tier = tier ?? data.tier;
          for (const result of data.results as { id: string; value: string }[]) {
            const item = items[Number(result.id)];
            if (!item) continue; // an id nobody asked for – see alignBatchResults
            entries.push({
              kind: item.kind, index: item.index, elementId: item.elementId,
              language: target, value: result.value,
            });
          }
        }
      } catch {
        if (signal?.aborted) return null;
        firstError = firstError ?? "network";
      }
    }
    // Progress stays counted in languages: chunking is an implementation detail of one.
    done += 1;
    onProgress?.(done);
  }

  return { entries, ...(firstError ? { firstError } : {}), ...(tier ? { tier } : {}) };
}

/** Translation of a screenshot document's texts into other languages, one call per
 *  language. Progress is counted in languages for the same reason. */
export function useEditorTranslation({ appName }: { appName?: string }) {
  const t = useTranslations();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const translateItems = useCallback(
    async (items: TranslatableItem[], sourceLanguage: string, targetLanguages: string[]) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const total = targetLanguages.length;
      setRunning(true);
      setProgress({ done: 0, total });
      try {
        const run = await runTranslationBatches({
          items, sourceLanguage, targetLanguages, appName,
          actionId: crypto.randomUUID(), // one gesture = one credit
          signal: controller.signal,
          onProgress: (done) => setProgress({ done, total }),
        });
        if (!run) return null; // aborted
        void notifyManagedDebit(run.tier, t);
        if (run.entries.length === 0) {
          toastAIError(run.firstError, t);
          return null;
        }
        if (run.firstError) toastAIError(run.firstError, t);
        return run.entries;
      } finally {
        setRunning(false);
        setProgress(null);
        abortRef.current = null;
      }
    },
    [appName, t],
  );

  return { running, progress, translateItems, cancel };
}
