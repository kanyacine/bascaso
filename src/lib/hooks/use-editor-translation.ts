"use client";

import { useCallback, useRef, useState } from "react";
import { notifyManagedDebit } from "@/lib/ai/debit-toast";
import { toastAIError } from "@/lib/ai/ai-error-toast";
import { useTranslations } from "@/lib/i18n/locale-context";
import type { TranslatableItem, TranslationEntry } from "@/lib/screenshot-editor/languages";

/** Fan-out of the /api/ai translate action over (item × target locale). One user gesture =
 *  one actionId shared by every call = one managed credit (route.ts:96-98). */
export function useEditorTranslation({ appName }: { appName?: string }) {
  const t = useTranslations();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const translateItems = useCallback(
    async (items: TranslatableItem[], sourceLanguage: string, targetLanguages: string[]) => {
      const actionId = crypto.randomUUID(); // one gesture = one credit, shared by every call below
      const controller = new AbortController();
      abortRef.current = controller;
      const total = items.length * targetLanguages.length;
      setRunning(true);
      setProgress({ done: 0, total });
      const entries: TranslationEntry[] = [];
      let done = 0;
      let debited = false;
      let firstError: string | undefined;
      try {
        for (const target of targetLanguages) {
          for (const item of items) {
            if (controller.signal.aborted) return null;
            try {
              const res = await fetch("/api/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "translate", actionId, text: item.text,
                  field: item.kind === "element" ? undefined : item.kind,
                  fromLocale: sourceLanguage, toLocale: target, appName,
                }),
                signal: controller.signal,
              });
              const data = await res.json();
              if (!res.ok) {
                firstError = firstError ?? data.error;
              } else {
                if (!debited) { debited = true; void notifyManagedDebit(data.tier, t); }
                entries.push({
                  kind: item.kind, index: item.index, elementId: item.elementId,
                  language: target, value: data.result,
                });
              }
            } catch {
              if (controller.signal.aborted) return null;
              firstError = firstError ?? "network";
            }
            done += 1;
            setProgress({ done, total });
          }
        }
        if (entries.length === 0) {
          toastAIError(firstError, t);
          return null;
        }
        if (firstError) toastAIError(firstError, t);
        return entries;
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
